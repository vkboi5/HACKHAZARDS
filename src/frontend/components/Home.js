import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
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
import AuctionCard from './AuctionCard';
import { Card, Button, Spinner } from 'react-bootstrap';
import { Col, Row } from 'react-bootstrap';
import MarketplaceService from '../components/MarketplaceService';

// Environment variables
const HORIZON_URL = process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;

// Initialize Stellar server
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

const PINATA_BASE_URL = 'https://api.pinata.cloud';

const HomePage = ({ marketplace, walletBalance }) => {
  const navigate = useNavigate();
  const nftCardSectionRef = useRef(null);
  const { publicKey, isLoggedIn, buyWithMoonpay } = useWallet();
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
  const [buying, setBuying] = useState(false);

  const handleCreateClick = () => {
    if (!isLoggedIn) {
      toast.error('Please login first!', { position: 'top-center' });
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

  const loadNFTs = async () => {
    try {
      setLoading(true);
      setLoadingState('loading');
      setError(null);

      console.log('Loading NFTs...');
      
      // Load the user's account data if they are connected
      let userAccount = null;
      if (publicKey && isLoggedIn) {
        try {
          userAccount = await server.loadAccount(publicKey);
          console.log('Loaded user account:', publicKey);
        } catch (accountError) {
          console.error('Error loading user account:', accountError);
        }
      }

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
                  pinata_api_key: pinataApiKey,
                  pinata_secret_api_key: pinataApiSecret,
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
                const nftData = metadataResponse.data;
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

                let accountId = nftData.creator;
                if (!accountId || !StellarSdk.StrKey.isValidEd25519PublicKey(accountId)) {
                  console.warn(`Invalid creator public key for ${ipfsHash}: ${accountId || 'undefined'}, skipping NFT`);
                  continue;
                }

                let assetCode = nftData.assetCode;
                if (!assetCode && nftData.attributes) {
                  const assetCodeAttr = nftData.attributes.find(attr => attr.trait_type === 'Asset Code');
                  assetCode = assetCodeAttr?.value;
                }
                if (!assetCode) {
                  assetCode = ipfsHash; // Fallback to IPFS hash if no asset code
                  console.warn(`No asset code found for ${ipfsHash}, using IPFS hash: ${assetCode}`);
                }

                const itemId = `${accountId}-${assetCode}`;
                const itemLikes = await loadLikesFromPinata(itemId);

                let isVerifiedOnStellar = false;
                try {
                  const account = await stellarServer.loadAccount(accountId);
                  const data = account.data_attr;
                  if (data[`nft_${assetCode}`] && data[`nft_${assetCode}_issued`]) {
                    isVerifiedOnStellar = true;
                  }
                } catch (accountError) {
                  console.warn(`Could not verify ${accountId} on Stellar: ${accountError.message}`);
                }

                console.log('NFT metadata:', {
                  ipfsHash: item.ipfs_pin_hash,
                  name: nftData.name,
                  price: nftData.price,
                  priceType: typeof nftData.price,
                  creator: nftData.creator,
                  assetCode: assetCode,
                  type: nftData.type || 'fixed_price'
                });
                
                // Determine NFT type
                let nftType = nftData.type || 'fixed_price';
                if (nftData.attributes) {
                  const listingAttr = nftData.attributes.find(attr => attr.trait_type === 'Listing Type');
                  if (listingAttr) {
                    if (listingAttr.value.toLowerCase().includes('open for bid')) {
                      nftType = 'open_bid';
                    } else if (listingAttr.value.toLowerCase().includes('timed auction')) {
                      nftType = 'timed_auction';
                    }
                  }
                }
                
                nftItems.push({
                  id: itemId,
                  accountId,
                  name: nftData.name,
                  description: nftData.description || 'No description',
                  image: optimizedImageUrl,
                  creator: accountId,
                  price: nftData.price || '0',
                  minimumBid: nftData.minimumBid || nftData.price || '0',
                  startingPrice: nftData.startingPrice || nftData.price || '0',
                  assetCode,
                  likes: itemLikes,
                  itemId,
                  storageType: nftData.storage_type || 'ipfs',
                  isVerifiedOnStellar,
                  type: nftType,
                  endTime: nftData.endTime || null
                });
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
        ].filter(accountId => accountId && StellarSdk.StrKey.isValidEd25519PublicKey(accountId));

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
                      console.warn(`Skipping invalid metadata for ${assetCode}: missing name or image`);
                      continue;
                    }

                    if (!nftData.creator || !StellarSdk.StrKey.isValidEd25519PublicKey(nftData.creator)) {
                      console.warn(`Invalid creator public key for ${assetCode}: ${nftData.creator || 'undefined'}, skipping NFT`);
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
                      minimumBid: nftData.minimumBid || nftData.price || '0',
                      startingPrice: nftData.startingPrice || nftData.price || '0',
                      assetCode,
                      likes: itemLikes,
                      itemId,
                      storageType: nftData.storage_type || 'ipfs',
                      isVerifiedOnStellar: true,
                      type: nftData.type || 'fixed_price',
                      endTime: nftData.endTime || null
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
      
      // Filter out purchased NFTs
      filteredItems = filteredItems.filter(item => {
        // 1. Check localStorage for purchased NFTs to ensure immediate update
        const purchasedItems = JSON.parse(localStorage.getItem('purchasedNfts') || '[]');
        if (purchasedItems.includes(item.assetCode)) {
          return false;
        }
        
        // 2. Check if this NFT was sold via bid acceptance
        const salesHistory = JSON.parse(localStorage.getItem('nftSales') || '[]');
        const isSold = salesHistory.some(sale => 
          sale.assetCode === item.assetCode && 
          sale.saleType === 'bid_accepted'
        );
        if (isSold) {
          return false;
        }
        
        // 3. Filter out fixed price NFTs that the user already owns
        if (publicKey && item.type === 'fixed_price') {
          // Check if user is the creator/issuer of this NFT
          const isCreator = item.creator === publicKey;
          
          // If user is NOT the creator, then check if they own this NFT
          if (!isCreator) {
            const assetBalance = userAccount?.balances?.find(balance => 
              balance.asset_code === item.assetCode && 
              balance.asset_issuer === item.creator
            );
            
            // If user has a positive balance of this NFT and is not the creator, they purchased it
            if (assetBalance && parseFloat(assetBalance.balance) > 0) {
              return false;
            }
          }
        }
        return true;
      });
      
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

    if (!userHasLiked) {
      setConfettiTrigger((prev) => ({
        ...prev,
        [itemId]: true,
      }));
      setTimeout(() => {
        setConfettiTrigger((prev) => ({
          ...prev,
          [itemId]: false,
        }));
      }, 2000);
    }

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
      if (event.key === 'nftPurchased' || event.key === 'nftCreated') {
        console.log('NFT event detected, refreshing list...');
        loadNFTs();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const formatWalletAddress = (address) => {
    if (!address || !StellarSdk.StrKey.isValidEd25519PublicKey(address)) return 'Unknown';
    return `${address.slice(0, 5)}***${address.slice(-4)}`;
  };

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const handlePlaceBid = (amount) => {
    if (!isLoggedIn) {
      toast.error('Please login first!', { position: 'top-center' });
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

  const handleBidPlaced = (nft, bidAmount) => {
    console.log(`Bid placed on ${nft.name} for ${bidAmount} XLM`);
    loadNFTs();
  };

  const handleBuyNFT = async (item) => {
    try {
      if (!isLoggedIn) {
        toast.error('Please login first!', { position: 'top-center' });
        return;
      }

      setBuying(true);
      await buyWithMoonpay(item.id, item.price);
      toast.success('Purchase initiated!', { position: 'top-center' });
    } catch (error) {
      console.error('Error buying NFT:', error);
      toast.error('Error initiating purchase. Please try again.', { position: 'top-center' });
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="home-page">
      <ToastContainer />
      {/* Hero Section */}
      <div className="hero-section" style={{ backgroundImage: `url(${backgroundImg})` }}>
        <div className="hero-content">
          <h1>Welcome to Galerie</h1>
          <p>Discover and collect unique digital assets</p>
          <div className="hero-buttons">
            <Button variant="primary" onClick={handleCreateClick}>
              Create NFT
            </Button>
            <Button variant="outline-light" onClick={handleExploreClick}>
              Explore
            </Button>
          </div>
        </div>
      </div>

      {/* NFT Cards Section */}
      <div ref={nftCardSectionRef} className="nft-cards-section">
        <h2>Featured NFTs</h2>
        {loading ? (
          <div className="loading-container">
            <img src={loaderGif} alt="Loading..." />
          </div>
        ) : error ? (
          <div className="error-container">
            <p>{error}</p>
          </div>
        ) : (
          <Row>
            {items.map((item) => (
              <Col key={item.id} xs={12} sm={6} md={4} lg={3}>
                <Card className="nft-card">
                  <Card.Img
                    variant="top"
                    src={item.image}
                    onError={handleImageError}
                  />
                  <Card.Body>
                    <Card.Title>{item.name}</Card.Title>
                    <Card.Text>{item.description}</Card.Text>
                    <div className="nft-actions">
                      <Button
                        variant="primary"
                        onClick={() => handleBuyNFT(item)}
                        disabled={buying}
                      >
                        {buying ? (
                          <>
                            <Spinner animation="border" size="sm" /> Buying...
                          </>
                        ) : (
                          'Buy with Card'
                        )}
                      </Button>
                      <Button
                        variant="outline-primary"
                        onClick={() => handleViewDetails(item)}
                      >
                        View Details
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* Item Details Modal */}
      <ItemDetailsModal
        show={showModal}
        onHide={() => setShowModal(false)}
        item={selectedItem}
        onBuy={handleBuyNFT}
        onBid={handlePlaceBid}
      />
    </div>
  );
};

export default HomePage;