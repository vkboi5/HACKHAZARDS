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
import MarketplaceService from './MarketplaceService';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useInView } from 'react-intersection-observer';
import { useWalletConnect } from './WalletConnectProvider';
import { useWeb3Auth } from './Web3AuthProvider';

// Environment variables
const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;

// Initialize Stellar server - moved inside the component to avoid global issues
const PINATA_BASE_URL = 'https://api.pinata.cloud';

const HomePage = ({ marketplace, walletBalance }) => {
  const navigate = useNavigate();
  const nftCardSectionRef = useRef(null);
  const { publicKey: walletPublicKey, isLoggedIn: walletIsLoggedIn, buyWithMoonpay } = useWallet();
  const { isConnected: isWalletConnected, publicKey: walletConnectPublicKey } = useWalletConnect();
  const { isConnected: isWeb3AuthConnected, publicKey: web3AuthPublicKey } = useWeb3Auth();
  
  // Combined authentication state
  const isLoggedIn = walletIsLoggedIn || isWalletConnected || isWeb3AuthConnected;
  const publicKey = walletPublicKey || walletConnectPublicKey || web3AuthPublicKey;

  // Debug authentication state
  useEffect(() => {
    console.log('Home component - Authentication state:', {
      walletIsLoggedIn,
      isWalletConnected,
      isWeb3AuthConnected,
      publicKey,
      isLoggedIn
    });
  }, [walletIsLoggedIn, isWalletConnected, isWeb3AuthConnected, publicKey, isLoggedIn]);

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
  const [batchSize, setBatchSize] = useState(8);
  
  // Initialize Stellar server inside component
  const stellarServer = useRef(new StellarSdk.Horizon.Server(HORIZON_URL));

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
      const pinataApiKey = import.meta.env.VITE_PINATA_API_KEY?.trim();
      const pinataApiSecret = import.meta.env.VITE_PINATA_API_SECRET?.trim();
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
      const pinataApiKey = import.meta.env.VITE_PINATA_API_KEY?.trim();
      const pinataApiSecret = import.meta.env.VITE_PINATA_API_SECRET?.trim();
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
      // Clear items before loading new ones
      setItems([]);

      console.log('Loading NFTs...');
      
      // Load the user's account data if they are connected
      let userAccount = null;
      if (publicKey && isLoggedIn) {
        try {
          userAccount = await stellarServer.current.loadAccount(publicKey);
          console.log('Loaded user account:', publicKey);
        } catch (accountError) {
          console.error('Error loading user account:', accountError);
        }
      }

      console.log('Environment variables:', {
        PINATA_API_KEY: import.meta.env.VITE_PINATA_API_KEY?.slice(0, 5) || 'undefined',
        PINATA_API_SECRET: import.meta.env.VITE_PINATA_API_SECRET?.slice(0, 5) || 'undefined',
        IPFS_GATEWAY: import.meta.env.VITE_IPFS_GATEWAY,
      });

      const pinataApiKey = import.meta.env.VITE_PINATA_API_KEY?.trim();
      const pinataApiSecret = import.meta.env.VITE_PINATA_API_SECRET?.trim();

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

      const nftItems = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;
      const maxRetries = 3;
      const retryDelay = 2000;

      // Show loading state but allow UI interaction
      setLoading(false);
      setLoadingState('loading-items');

      // Function to process batches and update UI progressively
      const processBatch = (items, startIdx) => {
        const endIdx = Math.min(startIdx + batchSize, items.length);
        const batch = items.slice(startIdx, endIdx);
        
        if (batch.length > 0) {
          setItems(prevItems => [...prevItems, ...batch]);
        }
        
        return endIdx;
      };

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

            // Process items in parallel batches for better performance
            const processItemPromises = [];
            const processedItems = [];

            for (const item of pinataItems) {
              processItemPromises.push((async () => {
                try {
                  const ipfsHash = item.ipfs_pin_hash;
                  const metadataUrl = `${import.meta.env.VITE_IPFS_GATEWAY}${ipfsHash}`;
                  
                  const metadataResponse = await axios.get(metadataUrl, { timeout: 10000 });
                  const nftData = metadataResponse.data;
                  
                  if (!nftData.name || !nftData.image) {
                    console.warn(`Skipping invalid metadata for ${ipfsHash}: missing name or image`);
                    return null;
                  }

                  let imageUrl = nftData.image;
                  if (imageUrl && imageUrl.startsWith('ipfs:')) {
                    imageUrl = imageUrl.replace('ipfs:', '');
                    imageUrl = `${import.meta.env.VITE_IPFS_GATEWAY}${imageUrl}`;
                  } else if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = `${import.meta.env.VITE_IPFS_GATEWAY}${imageUrl}`;
                  }

                  // Don't wait for image preloading, just set the URL
                  const optimizedImageUrl = optimizeImageUrl(imageUrl);

                  let accountId = nftData.creator;
                  if (!accountId || !StellarSdk.StrKey.isValidEd25519PublicKey(accountId)) {
                    console.warn(`Invalid creator public key for ${ipfsHash}: ${accountId || 'undefined'}, skipping NFT`);
                    return null;
                  }

                  let assetCode = nftData.assetCode;
                  if (!assetCode && nftData.attributes) {
                    const assetCodeAttr = nftData.attributes.find(attr => attr.trait_type === 'Asset Code');
                    assetCode = assetCodeAttr?.value;
                  }
                  if (!assetCode) {
                    assetCode = ipfsHash; // Fallback to IPFS hash if no asset code
                  }

                  const itemId = `${accountId}-${assetCode}`;
                  // Get likes asynchronously, don't block initial display
                  const itemLikes = 0; // We'll update this later
                  
                  // Fetch verification status asynchronously
                  let isVerifiedOnStellar = false;
                  try {
                    const account = await stellarServer.current.loadAccount(accountId);
                    const data = account.data_attr;
                    if (data[`nft_${assetCode}`] && data[`nft_${assetCode}_issued`]) {
                      isVerifiedOnStellar = true;
                    }
                  } catch (accountError) {
                    // Just continue with unverified status
                  }

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
                  
                  // Generate a truly unique ID for this item
                  const uniqueId = `${accountId}-${assetCode}-${ipfsHash}`;
                  
                  return {
                    id: uniqueId, // Use the unique ID for React keys
                    ipfsHash,     // Store the original hash
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
                    itemId: uniqueId, // Use the unique ID here too
                    storageType: nftData.storage_type || 'ipfs',
                    isVerifiedOnStellar,
                    type: nftType,
                    endTime: nftData.endTime || null
                  };
                } catch (itemError) {
                  console.error(`Error processing Pinata item ${item.ipfs_pin_hash}:`, itemError);
                  return null;
                }
              })());
            }

            // Wait for all items to be processed
            const results = await Promise.all(processItemPromises);
            
            // Filter out nulls and add valid items
            const validItems = results.filter(item => item !== null);
            processedItems.push(...validItems);
            
            // Add batch to nftItems and update UI
            nftItems.push(...processedItems);
            
            // Update UI with current batch
            if (processedItems.length > 0) {
              processBatch(processedItems, 0);
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

      // If we couldn't find any items, fall back to Stellar accounts
      if (nftItems.length === 0) {
        console.log('Falling back to Stellar account scanning...');
        const accountsToCheck = [
          publicKey,
          'GAHDNV6A6NSOQM5AMU64NH2LOOAIK474NCGX2FXTXBKD5YUZLTZQKSPV',
          'GBH7EWCV6AN42WOFRXTTKPZLRWBVPN3NOC4VIYVXPTNIUYUPLEJ6ODRW',
        ].filter(accountId => accountId && StellarSdk.StrKey.isValidEd25519PublicKey(accountId));

        const stellarItemPromises = [];

        for (const accountId of accountsToCheck) {
          stellarItemPromises.push((async () => {
            try {
              const account = await stellarServer.current.loadAccount(accountId);
              const data = account.data_attr;
              const accountItems = [];

              for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('nft_') && !key.endsWith('_issued')) {
                  const assetCode = key.replace('nft_', '');
                  const issuedKey = `nft_${assetCode}_issued`;
                  if (data[issuedKey] && Buffer.from(data[issuedKey], 'base64').toString() === 'true') {
                    let metadataUrl = Buffer.from(value, 'base64').toString();
                    if (!metadataUrl.startsWith('http')) {
                      metadataUrl = `${import.meta.env.VITE_IPFS_GATEWAY}${metadataUrl}`;
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
                        imageUrl = `${import.meta.env.VITE_IPFS_GATEWAY}${imageUrl}`;
                      }

                      const optimizedImageUrl = optimizeImageUrl(imageUrl);

                      const itemId = `${accountId}-${assetCode}`;
                      
                      accountItems.push({
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
                        likes: 0, // We'll update this later
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
              return accountItems;
            } catch (accountError) {
              console.error(`Error loading account ${accountId}:`, accountError);
              return [];
            }
          })());
        }

        // Process all accounts in parallel
        const accountResults = await Promise.all(stellarItemPromises);
        const stellarItems = accountResults.flat();
        
        // Add stellar items to nftItems
        nftItems.push(...stellarItems);
        
        // Update UI with current batch
        if (stellarItems.length > 0) {
          processBatch(stellarItems, 0);
        }
      }

      console.log(`Total NFTs found: ${nftItems.length}`);

      // Filter operation should run on all collected NFTs at once
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

      // Final update with filtered items
      setItems(filteredItems);
      setLoadingState('loaded');
      setLoading(false);

      if (nftItems.length === 0) {
        toast.info('No NFTs found. Be the first to create one!', { position: 'top-center' });
      }
      
      // Now that items are displayed, load the likes asynchronously
      nftItems.forEach(async (item) => {
        if (item.itemId) {
          const itemLikes = await loadLikesFromPinata(item.itemId);
          if (itemLikes > 0) {
            // Update the item's likes count without reloading everything
            setItems(prevItems => 
              prevItems.map(prevItem => 
                prevItem.id === item.id ? {...prevItem, likes: itemLikes} : prevItem
              )
            );
          }
        }
      });
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
      if (!isLoggedIn && !publicKey) {
        toast.error('Please login first!', { position: 'top-center' });
        return;
      }

      setBuying(true);
      console.log("Initiating MoonPay purchase for item:", item.id);
      console.log("Current wallet state:", { isLoggedIn, publicKey });
      
      // Create NFT details object with all necessary properties for MoonPay
      const nftDetails = {
        id: item.id,
        name: item.name,
        description: item.description,
        image: item.image,
        price: item.price,
        creator: item.creator,
        contractAddress: item.contractAddress || `stellar:${item.id}`
      };
      
      console.log('Initiating MoonPay NFT purchase with details:', nftDetails);
      
      // Pass the NFT details to MoonPay
      await buyWithMoonpay(item.id, item.price, nftDetails);
      toast.success('Purchase initiated!', { position: 'top-center' });
    } catch (error) {
      console.error('Error buying NFT:', error);
      toast.error('Error initiating purchase. Please try again.', { position: 'top-center' });
    } finally {
      setBuying(false);
    }
  };

  // Inside the Home component, add skeleton card component
  const SkeletonCard = () => (
    <div className="skeleton-card">
      <Skeleton height={200} width="100%" />
      <div className="skeleton-body">
        <Skeleton height={24} width="70%" style={{ marginBottom: '10px' }} />
        <Skeleton height={16} count={2} style={{ marginBottom: '10px' }} />
        <div className="skeleton-actions">
          <Skeleton height={36} width="45%" />
          <Skeleton height={36} width="45%" />
        </div>
      </div>
    </div>
  );

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
        
        {loading && loadingState === 'loading' ? (
          <div className="loading-container">
            <img src={loaderGif} alt="Loading..." />
          </div>
        ) : error ? (
          <div className="error-container">
            <p>{error}</p>
          </div>
        ) : (
          <>
            <Row>
              {items.map((item) => (
                <Col key={item.id} xs={12} sm={6} md={4} lg={3}>
                  <Card className="nft-card">
                    <Card.Img
                      variant="top"
                      src={item.image}
                      onError={handleImageError}
                      loading="lazy"
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
              
              {/* Show skeleton cards while loading items */}
              {loadingState === 'loading-items' && (
                Array(4).fill(0).map((_, index) => (
                  <Col key={`skeleton-${index}`} xs={12} sm={6} md={4} lg={3}>
                    <SkeletonCard />
                  </Col>
                ))
              )}
            </Row>
            
            {/* Only show "loading more" indicator when actually loading */}
            {loadingState === 'loading-items' && items.length > 0 && (
              <div className="text-center my-4">
                <Spinner animation="border" variant="primary" />
                <p>Loading more NFTs...</p>
              </div>
            )}
            
            {/* Show "No NFTs" message when appropriate */}
            {loadingState === 'loaded' && items.length === 0 && (
              <div className="text-center my-4">
                <p>No NFTs found. Be the first to create one!</p>
                <Button variant="primary" onClick={handleCreateClick} className="mt-2">
                  Create NFT
                </Button>
              </div>
            )}
          </>
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