import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletConnect } from './WalletConnectProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaHeart, FaTimes } from 'react-icons/fa';
import Confetti from 'react-dom-confetti';
import loaderGif from './loader.gif';
import './Home.css';
import Popup from 'reactjs-popup';
import backgroundImg from './bgfinal.png';
import ItemDetailsModal from './ItemDetailsModal';

const PINATA_BASE_URL = 'https://api.pinata.cloud';
const CACHE_KEY = 'nft_cache';
const CACHE_EXPIRY_MS = 10 * 1000; // 10 seconds

const HomePage = ({ marketplace, walletBalance }) => {
  const navigate = useNavigate();
  const nftCardSectionRef = useRef(null);
  const { publicKey, isConnected, balanceInXLM } = useWalletConnect();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [sortOrder, setSortOrder] = useState(null);
  const [likes, setLikes] = useState({});
  const [likedItems, setLikedItems] = useState({});
  const [confettiTrigger, setConfettiTrigger] = useState({});
  const [loadingState, setLoadingState] = useState('not-loaded');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageCache, setImageCache] = useState({});
  const [error, setError] = useState(null);

  const handleCreateClick = () => {
    if (!isConnected) {
      toast.error('Please connect your Stellar wallet first!', { position: 'top-center' });
      navigate('/stellar-setup');
      return;
    }
    navigate('/create');
  };

  const handleExploreClick = () => {
    if (nftCardSectionRef.current) {
      nftCardSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadLikesFromPinata = async (itemId) => {
    try {
      const pinataApiKey = process.env.REACT_APP_PINATA_API_KEY?.trim();
      const pinataApiSecret = process.env.REACT_APP_PINATA_API_SECRET?.trim();
      if (!pinataApiKey || !pinataApiSecret) {
        console.warn('Pinata credentials missing for likes, returning 0');
        return 0;
      }

      const response = await axios.get(
        `${PINATA_BASE_URL}/data/pinList?status=pinned&metadata[keyvalues][itemId]={"value": "${itemId}", "op": "eq"}`,
        {
          headers: {
            pinata_api_key: pinataApiKey,
            pinata_secret_api_key: pinataApiSecret,
          },
        }
      );

      const pinataItems = response.data.rows;
      if (pinataItems.length > 0) {
        const metadata = pinataItems[0].metadata.keyvalues;
        return metadata.likes ? parseInt(metadata.likes) : 0;
      }
    } catch (error) {
      console.error('Error loading likes from Pinata:', error);
    }
    return 0;
  };

  const updateLikesOnPinata = async (itemId, likes) => {
    try {
      const pinataApiKey = process.env.REACT_APP_PINATA_API_KEY?.trim();
      const pinataApiSecret = process.env.REACT_APP_PINATA_API_SECRET?.trim();
      if (!pinataApiKey || !pinataApiSecret) {
        console.warn('Pinata credentials missing for updating likes');
        return;
      }

      const metadata = {
        name: `likes-${itemId}`,
        keyvalues: {
          itemId: itemId,
          likes: likes.toString(),
        },
      };

      await axios.post(
        `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
        metadata,
        {
          headers: {
            pinata_api_key: pinataApiKey,
            pinata_secret_api_key: pinataApiSecret,
          },
        }
      );
    } catch (error) {
      console.error('Error updating likes on Pinata:', error);
    }
  };

  const optimizeImageUrl = useCallback((url) => {
    if (!url) return url;
    const optimizedUrl = new URL(url);
    optimizedUrl.searchParams.set('width', '300');
    optimizedUrl.searchParams.set('quality', '80');
    return optimizedUrl.toString();
  }, []);

  const preloadImage = useCallback((url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    });
  }, []);

  const getCachedNFTs = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      if (now - timestamp > CACHE_EXPIRY_MS) {
        console.log('Cache expired, clearing...');
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Error reading cache:', error);
      return null;
    }
  };

  const setCachedNFTs = (data) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      console.log('Cache updated');
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  };

  const loadNFTs = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setLoadingState('loading');

      // Check cache first unless forcing a refresh
      if (!forceRefresh) {
        const cachedNFTs = getCachedNFTs();
        if (cachedNFTs) {
          console.log('Using cached NFTs:', cachedNFTs.length);
          setItems(cachedNFTs);
          setLoadingState('loaded');
          setLoading(false);
          return;
        }
      }

      console.log('Fetching fresh NFTs...');
      console.log('Environment variables:', {
        PINATA_API_KEY: process.env.REACT_APP_PINATA_API_KEY?.slice(0, 5) || 'undefined',
        PINATA_API_SECRET: process.env.REACT_APP_PINATA_API_SECRET?.slice(0, 5) || 'undefined',
        IPFS_GATEWAY: process.env.REACT_APP_IPFS_GATEWAY,
      });

      const pinataApiKey = process.env.REACT_APP_PINATA_API_KEY?.trim();
      const pinataApiSecret = process.env.REACT_APP_PINATA_API_SECRET?.trim();

      if (!pinataApiKey || !pinataApiSecret) {
        throw new Error('Pinata API credentials are missing in .env file.');
      }
      if (typeof pinataApiKey !== 'string' || typeof pinataApiSecret !== 'string') {
        throw new Error('Pinata API credentials must be strings.');
      }

      console.log('Testing Pinata authentication...');
      try {
        const authResponse = await axios.get(
          'https://api.pinata.cloud/data/testAuthentication',
          {
            headers: {
              'pinata_api_key': pinataApiKey,
              'pinata_secret_api_key': pinataApiSecret,
            },
            timeout: 10000,
          }
        );
        console.log('Pinata authentication successful:', authResponse.data);
      } catch (authError) {
        console.error('Pinata authentication failed:', {
          message: authError.message,
          status: authError.response?.status,
          data: authError.response?.data,
        });
        throw new Error('Pinata authentication failed. Please verify your API keys.');
      }

      const stellarServer = new StellarSdk.Horizon.Server(
        process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );

      const nftItems = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;
      const maxRetries = 3;
      const retryDelay = 2000;

      while (hasMore) {
        let retryCount = 0;
        let lastError = null;

        while (retryCount <= maxRetries) {
          try {
            console.log(`Fetching Pinata pins, page ${page}, attempt ${retryCount + 1}...`);
            const response = await axios.get(
              'https://api.pinata.cloud/data/pinList',
              {
                params: {
                  status: 'pinned',
                  'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
                  pageLimit: pageSize,
                  pageOffset: (page - 1) * pageSize,
                },
                headers: {
                  'pinata_api_key': pinataApiKey,
                  'pinata_secret_api_key': pinataApiSecret,
                },
                timeout: 10000,
              }
            );

            const pinataItems = response.data.rows;
            console.log(`Found ${pinataItems.length} pinned items on page ${page}`);

            for (const item of pinataItems) {
              try {
                const ipfsHash = item.ipfs_pin_hash;
                const metadataUrl = `${process.env.REACT_APP_IPFS_GATEWAY}${ipfsHash}`;
                console.log(`Fetching metadata for ${ipfsHash}...`);

                const metadataResponse = await axios.get(metadataUrl, { timeout: 10000 });
                let nftData;
                
                // Check if the response is an image file
                if (metadataResponse.headers['content-type']?.includes('image/')) {
                  console.log(`Skipping image file at ${metadataUrl}`);
                  continue;
                }
                
                try {
                  nftData = metadataResponse.data;
                  // Ensure nftData is an object
                  if (typeof nftData !== 'object' || nftData === null) {
                    console.warn(`Invalid metadata format for ${ipfsHash}:`, nftData);
                    continue;
                  }
                } catch (error) {
                  console.error(`Failed to parse metadata for ${ipfsHash}:`, error);
                  continue;
                }

                console.log(`Metadata for ${ipfsHash}:`, nftData);

                if (!nftData.name || !nftData.image) {
                  console.warn(`Skipping invalid metadata for ${ipfsHash}: missing name or image`);
                  continue;
                }

                let imageUrl = nftData.image;
                if (imageUrl && imageUrl.startsWith('ipfs:')) {
                  imageUrl = imageUrl.replace('ipfs:', '');
                  imageUrl = `${process.env.REACT_APP_IPFS_GATEWAY}${imageUrl}`;
                } else if (imageUrl && !imageUrl.startsWith('http')) {
                  imageUrl = `${process.env.REACT_APP_IPFS_GATEWAY}${imageUrl}`;
                }

                const optimizedImageUrl = optimizeImageUrl(imageUrl);
                if (!imageCache[optimizedImageUrl]) {
                  try {
                    await preloadImage(optimizedImageUrl);
                    setImageCache(prev => ({ ...prev, [optimizedImageUrl]: true }));
                  } catch (error) {
                    console.error(`Failed to preload image: ${optimizedImageUrl}`, error);
                    continue;
                  }
                }

                const itemId = `${nftData.creator || 'unknown'}-${nftData.assetCode || ipfsHash}`;
                const itemLikes = await loadLikesFromPinata(itemId);

                let accountId = nftData.creator;
                let assetCode = nftData.assetCode;
                let isVerifiedOnStellar = false;

                // Try to extract asset code from metadata attributes if not present in root
                if (!assetCode && nftData.attributes) {
                  const assetCodeAttr = nftData.attributes.find(attr => attr.trait_type === 'Asset Code');
                  if (assetCodeAttr) {
                    assetCode = assetCodeAttr.value;
                    console.log('Extracted asset code from metadata attributes:', assetCode);
                  }
                }

                // Skip verification if no valid account ID
                if (!accountId || !StellarSdk.StrKey.isValidEd25519PublicKey(accountId)) {
                  console.log(`Skipping verification for NFT with invalid or missing creator account ID: ${accountId || 'undefined'}`);
                } else {
                  try {
                    const account = await stellarServer.loadAccount(accountId);
                    const data = account.data_attr;
                    console.log('All data attributes:', data);
                    
                    // If no asset code from metadata, try to find it in the data attributes
                    if (!assetCode) {
                      const dataKeys = Object.keys(data);
                      // Look for any NFT-related keys
                      const nftKeys = dataKeys.filter(key => key.startsWith('nft_'));
                      
                      if (nftKeys.length > 0) {
                        // Extract the asset code from the first key, removing 'nft_' and any suffix
                        assetCode = nftKeys[0].replace('nft_', '').split('_')[0];
                        console.log('Extracted asset code from NFT key:', assetCode);
                      } else {
                        assetCode = 'UNKNOWN';
                        console.log('No NFT keys found in data attributes');
                      }
                    }
                    
                    let verificationDetails = {
                      hasMetadata: false,
                      hasIssued: false,
                      dataKeys: Object.keys(data),
                      assetCodeUsed: assetCode
                    };

                    // Validate assetCode (must be 1-12 alphanumeric, not an IPFS hash)
                    if (assetCode && /^[A-Z0-9]{1,12}$/.test(assetCode)) {
                      // Check for both metadata and issued flags in both formats
                      const metadataKey1 = `nft_${assetCode}`;
                      const metadataKey2 = `nft_${assetCode}_metadata`;
                      const issuedKey = `nft_${assetCode}_issued`;
                      
                      // Check if either metadata key exists
                      const hasMetadataKey = Object.keys(data).includes(metadataKey1) || Object.keys(data).includes(metadataKey2);
                      const hasIssuedKey = Object.keys(data).includes(issuedKey);
                      
                      verificationDetails.hasMetadata = hasMetadataKey;
                      verificationDetails.hasIssued = hasIssuedKey;
                      
                      // Log the actual values for debugging
                      console.log(`Checking metadata keys "${metadataKey1}" and "${metadataKey2}":`, hasMetadataKey ? 'exists' : 'missing');
                      console.log(`Checking issued key "${issuedKey}":`, hasIssuedKey ? 'exists' : 'missing');
                      
                      if (hasMetadataKey) {
                        if (hasIssuedKey) {
                          isVerifiedOnStellar = true;
                          console.log(`NFT ${assetCode} verified successfully with both metadata and issued flags`);
                        } else {
                          console.log(`NFT ${assetCode} has metadata but is not issued yet`);
                          verificationDetails.status = 'pending_issuance';
                        }
                      } else {
                        console.log(`NFT ${assetCode} verification failed - missing metadata`);
                        verificationDetails.status = 'missing_metadata';
                      }
                    } else {
                      console.warn(`Invalid assetCode for verification: ${assetCode}`);
                      verificationDetails.error = 'Invalid assetCode (must be 1-12 alphanumeric characters)';
                      verificationDetails.status = 'invalid_asset_code';
                    }

                    console.log(`Verification for ${accountId}, assetCode: ${assetCode}`, verificationDetails);

                    nftItems.push({
                      id: itemId,
                      accountId: accountId || 'unknown',
                      name: nftData.name,
                      description: nftData.description || 'No description',
                      image: optimizedImageUrl,
                      creator: accountId || 'unknown',
                      price: nftData.price || '0',
                      assetCode,
                      likes: itemLikes,
                      itemId: itemId,
                      storageType: nftData.storage_type || 'ipfs',
                      isVerifiedOnStellar
                    });
                  } catch (accountError) {
                    console.error(`Failed to verify ${accountId} for assetCode ${assetCode}:`, accountError.message);
                    nftItems.push({
                      id: itemId,
                      accountId: accountId || 'unknown',
                      name: nftData.name,
                      description: nftData.description || 'No description',
                      image: optimizedImageUrl,
                      creator: accountId || 'unknown',
                      price: nftData.price || '0',
                      assetCode,
                      likes: itemLikes,
                      itemId: itemId,
                      storageType: nftData.storage_type || 'ipfs',
                      isVerifiedOnStellar: false
                    });
                  }
                }
              } catch (itemError) {
                console.error(`Error processing Pinata item ${item.ipfs_pin_hash}:`, itemError);
              }
            }

            page++;
            if (pinataItems.length < pageSize) {
              hasMore = false;
            }
            break;
          } catch (pinataError) {
            lastError = pinataError;
            console.error(`Pinata fetch error, page ${page}, attempt ${retryCount + 1}:`, {
              message: pinataError.message,
              status: pinataError.response?.status,
              data: pinataError.response?.data,
            });

            if (retryCount >= maxRetries) {
              break;
            }

            if (pinataError.response?.status === 429) {
              console.log('Rate limit hit, waiting longer...');
              await new Promise((resolve) => setTimeout(resolve, retryDelay * 2));
            } else {
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
            retryCount++;
          }
        }

        if (lastError && retryCount > maxRetries) {
          console.error('Failed to fetch Pinata pins after retries:', lastError);
          toast.warn('Failed to fetch NFTs from Pinata. Falling back to Stellar accounts...', {
            position: 'top-center',
          });
          break;
        }
      }

      if (nftItems.length === 0) {
        console.log('Falling back to Stellar account scanning...');
        const accountsToCheck = [
          publicKey,
          'GAHDNV6A6NSOQM5AMU64NH2LOOAIK474NCGX2FXTXBKD5YUZLTZQKSPV',
          'GBH7EWCV6AN42WOFRXTTKPZLRWBVPN3NOC4VIYVXPTNIUYUPLEJ6ODRW',
        ].filter(Boolean);

        for (const accountId of accountsToCheck) {
          try {
            const account = await stellarServer.loadAccount(accountId);
            const data = account.data_attr;

            for (const [key, value] of Object.entries(data)) {
              if (key.startsWith('nft_') && !key.endsWith('_issued')) {
                const assetCode = key.replace('nft_', '');
                const issuedKey = `nft_${assetCode}_issued`;
                if (data[issuedKey] && Buffer.from(data[issuedKey], 'base64').toString() === 'true') {
                  let metadataUrl = Buffer.from(value, 'base64').toString();
                  if (!metadataUrl.startsWith('http')) {
                    metadataUrl = `${process.env.REACT_APP_IPFS_GATEWAY}${metadataUrl}`;
                  }

                  try {
                    const metadataResponse = await axios.get(metadataUrl, { timeout: 10000 });
                    const nftData = metadataResponse.data;

                    if (!nftData.name || !nftData.image) {
                      console.warn(`Skipping invalid metadata for ${assetCode}`);
                      continue;
                    }

                    let imageUrl = nftData.image;
                    if (imageUrl && !imageUrl.startsWith('http')) {
                      imageUrl = `${process.env.REACT_APP_IPFS_GATEWAY}${imageUrl}`;
                    }

                    const optimizedImageUrl = optimizeImageUrl(imageUrl);
                    if (!imageCache[optimizedImageUrl]) {
                      try {
                        await preloadImage(optimizedImageUrl);
                        setImageCache(prev => ({ ...prev, [optimizedImageUrl]: true }));
                      } catch (error) {
                        console.error(`Failed to preload image: ${optimizedImageUrl}`, error);
                        continue;
                      }
                    }

                    const itemId = `${accountId}-${assetCode}`;
                    const itemLikes = await loadLikesFromPinata(itemId);

                    nftItems.push({
                      id: itemId,
                      accountId,
                      name: nftData.name,
                      description: nftData.description || 'No description',
                      image: optimizedImageUrl,
                      creator: accountId,
                      price: nftData.price || '0',
                      assetCode,
                      likes: itemLikes,
                      itemId,
                      storageType: nftData.storage_type || 'ipfs',
                      isVerifiedOnStellar: true
                    });
                  } catch (metadataError) {
                    console.error(`Error fetching metadata for ${assetCode}:`, metadataError);
                  }
                }
              }
            }
          } catch (accountError) {
            console.error(`Error loading account ${accountId}:`, accountError);
          }
        }
      }

      console.log(`Total NFTs found: ${nftItems.length}`);

      let filteredItems = [...nftItems];
      if (selectedFilter && sortOrder) {
        filteredItems.sort((a, b) => {
          if (selectedFilter === 'price') {
            const priceA = parseFloat(a.price) || 0;
            const priceB = parseFloat(b.price) || 0;
            return sortOrder === 'highToLow' ? priceB - priceA : priceA - priceB;
          } else if (selectedFilter === 'popularity') {
            const likesA = a.likes || 0;
            const likesB = b.likes || 0;
            return sortOrder === 'highToLow' ? likesB - likesA : likesA - likesB;
          }
          return 0;
        });
      }

      setItems(filteredItems);
      setCachedNFTs(filteredItems); // Update cache
      setLoadingState('loaded');
      setLoading(false);

      if (nftItems.length === 0) {
        toast.info('No NFTs found. Be the first to create one!', { position: 'top-center' });
      }
    } catch (error) {
      console.error('Error loading NFTs:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
      });

      setLoading(false);
      setLoadingState('error');

      let errorMessage = 'Failed to load NFTs';
      if (error.message.includes('Pinata API credentials')) {
        errorMessage = error.message;
      } else if (error.response) {
        if (error.response.status === 401) {
          errorMessage = 'Pinata authentication failed (401). Please check your API keys.';
        } else if (error.response.status === 429) {
          errorMessage = 'Pinata rate limit exceeded. Please try again later.';
        } else if (error.response.status >= 500) {
          errorMessage = 'Pinata server error. Please try again later.';
        }
      } else if (error.request) {
        errorMessage = 'Network error connecting to Pinata. Please check your internet.';
      } else {
        errorMessage = error.message;
      }

      toast.error(errorMessage, {
        position: 'top-center',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

  const handleLike = async (itemId) => {
    if (!itemId) return;

    const currentLikes = likes[itemId] || 0;
    const userHasLiked = likedItems[itemId] || false;

    const newLikes = userHasLiked ? currentLikes - 1 : currentLikes + 1;
    setLikes((prevLikes) => ({
      ...prevLikes,
      [itemId]: newLikes,
    }));
    setLikedItems((prevLikedItems) => ({
      ...prevLikedItems,
      [itemId]: !userHasLiked,
    }));

    await updateLikesOnPinata(itemId, newLikes);
  };

  useEffect(() => {
    const storedLikes = JSON.parse(localStorage.getItem('likes')) || {};
    const storedLikedItems = JSON.parse(localStorage.getItem('likedItems')) || {};
    setLikes(storedLikes);
    setLikedItems(storedLikedItems);
  }, []);

  useEffect(() => {
    localStorage.setItem('likes', JSON.stringify(likes));
    localStorage.setItem('likedItems', JSON.stringify(likedItems));
  }, [likes, likedItems]);

  useEffect(() => {
    loadNFTs();
  }, [publicKey]);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'nftCreated') {
        console.log('New NFT created, refreshing list...');
        loadNFTs(true); // Force refresh on new NFT creation
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const formatWalletAddress = (address) => {
    if (!address || address === 'unknown') return 'Unknown';
    return `${address.slice(0, 5)}***${address.slice(-4)}`;
  };

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const handlePlaceBid = (amount) => {
    if (!isConnected) {
      toast.error('Please connect your Stellar wallet first!', { position: 'top-center' });
      return;
    }

    if (!selectedItem) {
      toast.error('No item selected for bidding', { position: 'top-center' });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid bid amount', { position: 'top-center' });
      return;
    }

    toast.success(`Bid of ${amount} XLM placed successfully on ${selectedItem.name}!`, {
      position: 'top-center',
    });

    setBidAmount('');
    setShowModal(false);
  };

  const handleImageError = (e) => {
    e.target.src = loaderGif;
    console.error(`Failed to load image: ${e.target.src}`);
  };

  return (
    <div className="home-container">
      <div className="gradient-section">
        <div className="gradient-sphere sphere1"></div>
        <div className="gradient-sphere sphere2"></div>
        <div className="gradient-sphere sphere3"></div>

        <div className="home-content">
          <div className="home-text">
            <h1 className="heading-line1">Connecting Artists</h1>
            <h1 className="heading-line2">and Collectors through</h1>
            <h1 className="heading-innovation">NFT INNOVATION</h1>
            <p>Discover, collect, and trade exclusive NFTs effortlessly!</p>
            <div className="home-buttons">
              <button
                className="explore-button"
                onClick={() => window.scrollTo({ top: document.querySelector('.white-section').offsetTop, behavior: 'smooth' })}
              >
                Explore
              </button>
              <button className="create-button" onClick={handleCreateClick}>
                Create
              </button>
            </div>
          </div>
          <div className="hero-illustration"></div>
        </div>
        <div className="curved-line"></div>
      </div>

      <div className="white-section">
        <div className="container">
          <h2 className="text-center my-4">Featured NFTs</h2>
          <div className="row">
            <div className="col-12">
              <input
                type="text"
                className="form-control mb-4"
                placeholder="Search for NFTs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="d-flex justify-content-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : (
            <div className="NftCardContainer">
              {items.length > 0 ? (
                items
                  .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((item, idx) => (
                    <div key={idx} className="NftCard">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="NftCardImage"
                        loading="lazy"
                        onError={handleImageError}
                        style={{
                          backgroundImage: `url(${loaderGif})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                      <div className="NftCardContent">
                        <h3 className="NftCardTitle">{item.name}</h3>
                        <p className="NftCardDescription">{item.description}</p>
                        <div className="account-badge">
                          {item.accountId ===
                            'GAHDNV6A6NSOQM5AMU64NH2LOOAIK474NCGX2FXTXBKD5YUZLTZQKSPV' && (
                            <span className="badge bg-info">
                              <small>Featured Collection</small>
                            </span>
                          )}
                          {item.accountId === publicKey && (
                            <span className="badge bg-success">
                              <small>Your Collection</small>
                            </span>
                          )}
                          <span className="badge bg-light text-dark">
                            <small>Owner: {formatWalletAddress(item.accountId)}</small>
                          </span>
                          {!item.isVerifiedOnStellar && (
                            <span className="badge bg-warning">
                              <small>Not Verified on Stellar</small>
                            </span>
                          )}
                        </div>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="NftCardPrice">{item.price || '0'} XLM</span>
                          <div>
                            <button
                              className="btn btn-outline-danger btn-sm me-2"
                              onClick={() => handleLike(item.itemId)}
                            >
                              <FaHeart style={{ color: likedItems[item.itemId] ? '#dc3545' : 'inherit' }} />{' '}
                              {likes[item.itemId] || 0}
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleViewDetails(item)}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-center my-5">
                  <h4>No NFTs Found</h4>
                  <p>Be the first to create an NFT marketplace listing!</p>
                  <button className="btn btn-primary" onClick={handleCreateClick}>
                    Create NFT
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <ItemDetailsModal
          show={showModal}
          onHide={() => setShowModal(false)}
          item={selectedItem}
          onBid={handlePlaceBid}
          bidAmount={bidAmount}
          setBidAmount={setBidAmount}
        />
      )}
      <ToastContainer />
    </div>
  );
};

export default HomePage;