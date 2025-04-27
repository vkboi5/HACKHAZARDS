import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletConnect } from './WalletConnectProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast } from './ToastWrapper';
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
  const { publicKey, isConnected, balanceInXLM, signAndSubmitTransaction } = useWalletConnect();
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
    if (!isConnected) {
      showToast.error('Please connect your Stellar wallet first!');
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
      const pinataJWT = process.env.REACT_APP_PINATA_JWT?.trim();
      if (!pinataJWT) {
        console.warn('Pinata JWT missing for likes, returning 0');
        return 0;
      }

      const response = await axios.get(
        `${PINATA_BASE_URL}/data/pinList`,
        {
          params: {
            status: 'pinned',
            metadata: {
              keyvalues: {
                itemId: {
                  value: itemId,
                  op: 'eq'
                }
              }
            }
          },
          headers: {
            'Authorization': `Bearer ${pinataJWT}`
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
      const pinataJWT = process.env.REACT_APP_PINATA_JWT?.trim();
      if (!pinataJWT) {
        console.warn('Pinata JWT missing for updating likes');
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
            'Authorization': `Bearer ${pinataJWT}`
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
      if (publicKey && isConnected) {
        try {
          userAccount = await server.loadAccount(publicKey);
          console.log('Loaded user account:', publicKey);
        } catch (accountError) {
          console.error('Error loading user account:', accountError);
        }
      }

      // Use JWT for Pinata authentication instead of API key/secret
      const pinataJWT = process.env.REACT_APP_PINATA_JWT?.trim();
      const ipfsGateway = process.env.REACT_APP_IPFS_GATEWAY?.trim();

      if (!pinataJWT) {
        throw new Error('Pinata JWT token is missing in .env file.');
      }
      if (!ipfsGateway) {
        throw new Error('IPFS Gateway URL is missing in .env file.');
      }

      console.log('Testing Pinata authentication...');
      try {
        const authResponse = await axios.get(
          'https://api.pinata.cloud/data/testAuthentication',
          {
            headers: {
              'Authorization': `Bearer ${pinataJWT}`
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
        throw new Error('Pinata authentication failed. Please verify your JWT token.');
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
      const batchSize = 8;

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
                  metadata: {
                    keyvalues: {
                      app: {
                        value: 'Galerie',
                        op: 'eq'
                      }
                    }
                  },
                  pageLimit: pageSize,
                  pageOffset: (page - 1) * pageSize,
                },
                headers: {
                  'Authorization': `Bearer ${pinataJWT}`
                },
                timeout: 15000,
              }
            );

            const pinataItems = response.data.rows;
            console.log(`Found ${pinataItems.length} pinned items on page ${page}`);

            // Process items in parallel batches for better performance
            const itemBatches = [];
            for (let i = 0; i < pinataItems.length; i += batchSize) {
              itemBatches.push(pinataItems.slice(i, i + batchSize));
            }

            // Process each batch sequentially, but process items within batch in parallel
            for (const batch of itemBatches) {
              const batchPromises = batch.map(async (item) => {
                try {
                  const ipfsHash = item.ipfs_pin_hash;
                  const metadataUrl = `${ipfsGateway}${ipfsHash}`;
                  
                  const metadataResponse = await axios.get(metadataUrl, { timeout: 10000 });
                  const nftData = metadataResponse.data;
                  
                  if (!nftData.name || !nftData.image) {
                    console.warn(`Skipping invalid metadata for ${ipfsHash}: missing name or image`);
                    return null;
                  }

                  let imageUrl = nftData.image;
                  if (imageUrl && imageUrl.startsWith('ipfs:')) {
                    const hash = imageUrl.replace('ipfs://', '').replace('ipfs:', '');
                    imageUrl = `${ipfsGateway}${hash}`;
                  } else if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = `${ipfsGateway}${imageUrl}`;
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
                    assetCode = ipfsHash.substring(0, 12); // Fallback to IPFS hash if no asset code
                  }

                  const itemId = `${accountId}-${assetCode}`;
                  
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
                    likes: 0, // We'll update this later
                    itemId: uniqueId, // Use the unique ID here too
                    storageType: nftData.storage_type || 'ipfs',
                    isVerifiedOnStellar: false, // We'll check this later
                    type: nftType,
                    endTime: nftData.endTime || null
                  };
                } catch (itemError) {
                  console.error(`Error processing Pinata item ${item.ipfs_pin_hash}:`, itemError);
                  return null;
                }
              });

              const batchResults = await Promise.all(batchPromises);
              const validItems = batchResults.filter(item => item !== null);
              
              if (validItems.length > 0) {
                nftItems.push(...validItems);
                // Update UI with current batch
                setItems(prevItems => [...prevItems, ...validItems]);
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
          showToast.warn('Failed to fetch NFTs from Pinata. Falling back to Stellar accounts...');
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

        for (const accountId of accountsToCheck) {
          try {
            const account = await stellarServer.loadAccount(accountId);
            const data = account.data_attr;
            const accountItems = [];

            for (const [key, value] of Object.entries(data)) {
              if (key.startsWith('nft_') && !key.endsWith('_issued')) {
                const assetCode = key.replace('nft_', '');
                const issuedKey = `nft_${assetCode}_issued`;
                if (data[issuedKey] && Buffer.from(data[issuedKey], 'base64').toString() === 'true') {
                  let metadataUrl = Buffer.from(value, 'base64').toString();
                  if (!metadataUrl.startsWith('http')) {
                    metadataUrl = `${ipfsGateway}${metadataUrl}`;
                  }

                  try {
                    const metadataResponse = await axios.get(metadataUrl, { timeout: 10000 });
                    const nftData = metadataResponse.data;

                    if (!nftData.name || !nftData.image) {
                      console.warn(`Skipping invalid metadata for ${assetCode}: missing name or image`);
                      continue;
                    }

                    let imageUrl = nftData.image;
                    if (imageUrl && !imageUrl.startsWith('http')) {
                      imageUrl = `${ipfsGateway}${imageUrl}`;
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

            if (accountItems.length > 0) {
              nftItems.push(...accountItems);
              // Update UI with current batch
              setItems(prevItems => [...prevItems, ...accountItems]);
            }
          } catch (accountError) {
            console.error(`Error loading account ${accountId}:`, accountError);
          }
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
        if (publicKey && item.type === 'fixed_price' && userAccount) {
          // Check if user is the creator/issuer of this NFT
          const isCreator = item.creator === publicKey;
          
          // If user is NOT the creator, then check if they own this NFT
          if (!isCreator) {
            const assetBalance = userAccount.balances.find(balance => 
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
        showToast.info('No NFTs found. Be the first to create one!');
      }
      
      // Now that items are displayed, load likes and verification status asynchronously
      filteredItems.forEach(async (item) => {
        if (item.itemId) {
          // Load likes
          const itemLikes = await loadLikesFromPinata(item.itemId);
          
          // Check verification status on Stellar
          let isVerified = false;
          try {
            const creatorAccount = await stellarServer.loadAccount(item.creator);
            const data = creatorAccount.data_attr;
            const nftKey = `nft_${item.assetCode}`;
            const issuedKey = `nft_${item.assetCode}_issued`;
            if (data[nftKey] && data[issuedKey]) {
              isVerified = true;
            }
          } catch (err) {
            // Just continue with unverified status
          }
          
          // Update the item with likes and verification status
          setItems(prevItems => 
            prevItems.map(prevItem => 
              prevItem.id === item.id ? {
                ...prevItem, 
                likes: itemLikes,
                isVerifiedOnStellar: isVerified
              } : prevItem
            )
          );
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
      if (error.message.includes('Pinata')) {
        errorMessage = error.message;
      } else if (error.response) {
        if (error.response.status === 401) {
          errorMessage = 'Pinata authentication failed (401). Please check your JWT token.';
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

      showToast.error(errorMessage);
      setError(errorMessage);
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
    if (!isConnected) {
      showToast.error('Please connect your Stellar wallet first!');
      return;
    }

    if (!selectedItem) {
      showToast.error('No item selected for bidding');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      showToast.error('Please enter a valid bid amount');
      return;
    }

    showToast.success(`Bid of ${amount} XLM placed successfully on ${selectedItem.name}!`);

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
    if (!isConnected) {
      showToast.error('Please connect your wallet first!');
      return;
    }

    setBuying(item.id);
    setError(null);

    try {
      // Determine the appropriate price based on NFT type
      let validatedPrice;
      
      console.log('Buying NFT:', {
        item,
        isAuction: item.type === 'timed_auction' || item.type === 'open_bid'
      });
      
      if (item.type === 'fixed_price') {
        validatedPrice = item.price;
      } else if (item.type === 'open_bid') {
        validatedPrice = item.minimumBid;
        showToast.error('Open for Bids NFTs require you to place a bid instead of buying directly');
        setBuying(false);
        return;
      } else if (item.type === 'timed_auction') {
        validatedPrice = item.startingPrice || item.price;
        showToast.error('Timed Auction NFTs require you to place a bid instead of buying directly');
        setBuying(false);
        return;
      } else {
        // Default fallback
        validatedPrice = item.price;
      }
      
      // Ensure we have a valid price
      if (!validatedPrice || isNaN(parseFloat(validatedPrice)) || parseFloat(validatedPrice) <= 0) {
        throw new Error(`Invalid price: ${validatedPrice || '0'} (must be a positive number)`);
      }
      
      console.log('Buying NFT with params:', {
        assetCode: item.assetCode,
        buyer: publicKey,
        price: validatedPrice,
        creator: item.creator,
        type: item.type
      });
      
      await MarketplaceService.buyNFT(
        item.assetCode,
        publicKey,
        validatedPrice,
        item.creator,
        signAndSubmitTransaction
      );
      
      showToast.success(`Successfully purchased ${item.name} for ${validatedPrice} XLM!`);
      
      // Mark the item as purchased in local storage to ensure it's reflected immediately
      try {
        const purchasedItems = JSON.parse(localStorage.getItem('purchasedNfts') || '[]');
        if (!purchasedItems.includes(item.assetCode)) {
          purchasedItems.push(item.assetCode);
          localStorage.setItem('purchasedNfts', JSON.stringify(purchasedItems));
        }
        // Trigger a storage event for other components to react
        localStorage.setItem('nftPurchased', new Date().toISOString());
      } catch (storageError) {
        console.error('Error storing purchase in localStorage:', storageError);
      }
      
      // Refresh NFTs after purchase
      setTimeout(() => {
        loadNFTs();
      }, 3000);
      
    } catch (error) {
      const errorMessage = `Failed to buy NFT: ${error.message}`;
      setError(errorMessage);
      showToast.error(errorMessage);
    } finally {
      setBuying(false);
    }
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
                  .map((item, idx) => {
                    console.log('Rendering NFT item:', {
                      name: item.name,
                      type: item.type,
                      price: item.price,
                      minimumBid: item.minimumBid,
                      startingPrice: item.startingPrice
                    });
                    
                    const isAuctionOrBid = item.type === 'open_bid' || item.type === 'timed_auction';
                    
                    return (
                      <div key={idx} className="nft-grid-item">
                        {isAuctionOrBid ? (
                          <AuctionCard 
                            nft={item} 
                            onBidPlaced={handleBidPlaced} 
                            refreshNFTs={loadNFTs} 
                          />
                        ) : (
                          <Card className="market-item-card">
                            <Card.Img variant="top" src={item.image} className="card-img-top" />
                            <Card.Body>
                              <Card.Title>{item.name}</Card.Title>
                              <Card.Text>{item.description}</Card.Text>
                              <div className="d-flex justify-content-between align-items-center">
                                <div className="price-tag">{item.price} XLM</div>
                                <Button 
                                  onClick={() => handleBuyNFT(item)}
                                  disabled={item.creator === publicKey || !isConnected || buying === item.id}
                                  className="buy-button"
                                >
                                  {buying === item.id ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    "Buy"
                                  )}
                                </Button>
                              </div>
                            </Card.Body>
                          </Card>
                        )}
                      </div>
                    );
                  })
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
          onHide={() => {
            setShowModal(false);
            loadNFTs(); // Refresh NFT list after modal closes
          }}
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