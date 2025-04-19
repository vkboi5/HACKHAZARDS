import React, { useState, useEffect, useRef } from 'react';
import { useStellarWallet } from './StellarWalletProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
import noAssetsGif from './crying.gif';
import { FaHeart, FaTimes } from 'react-icons/fa';
import Confetti from 'react-dom-confetti';
import loaderGif from './loader.gif';
import './Home.css';
import Popup from 'reactjs-popup';
import backgroundImg from './bgfinal.png';

const PINATA_BASE_URL = 'https://api.pinata.cloud';

const HomePage = () => {
  const navigate = useNavigate();
  const nftCardSectionRef = useRef(null);
  const { publicKey, isConnected, server } = useStellarWallet();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [sortOrder, setSortOrder] = useState(null);
  const [likes, setLikes] = useState({});
  const [likedItems, setLikedItems] = useState({});
  const [confettiTrigger, setConfettiTrigger] = useState({});

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
      const response = await axios.get(`${PINATA_BASE_URL}/data/pinList?status=pinned&metadata[keyvalues][itemId]={"value": "${itemId}", "op": "eq"}`, {
        headers: {
          pinata_api_key: process.env.REACT_APP_PINATA_API_KEY,
          pinata_secret_api_key: process.env.REACT_APP_PINATA_SECRET_API_KEY
        }
      });

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
      const metadata = {
        name: `likes-${itemId}`,
        keyvalues: {
          itemId: itemId,
          likes: likes.toString()
        }
      };

      const response = await axios.post(`${PINATA_BASE_URL}/pinning/pinJSONToIPFS`, metadata, {
        headers: {
          pinata_api_key: process.env.REACT_APP_PINATA_API_KEY,
          pinata_secret_api_key: process.env.REACT_APP_PINATA_SECRET_API_KEY
        }
      });

      return response.data.IpfsHash;
    } catch (error) {
      console.error('Error updating likes on Pinata:', error);
    }
  };

  const loadNFTs = async () => {
    if (!isConnected) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Use server from context when available, otherwise initialize directly
      // This ensures we use the same server instance that's already authenticated
      const stellarServer = server || new StellarSdk.Horizon.Server(
        process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );
      
      // Set up pagination and counters for query
      const nftItems = [];
      let accountsPage = null;
      let pageCounter = 1;
      const maxPages = 5; // Limit pages to prevent excessive API calls
      
      // Function to decode base64 data from Stellar
      const decodeFromBase64 = (value) => {
        try {
          // In Stellar's API, data is stored as base64
          return Buffer.from(value, 'base64').toString('utf-8');
        } catch (e) {
          console.warn('Failed to decode base64 value:', e);
          return null;
        }
      };
      
      // Function to validate and process URLs
      const processMetadataUrl = (url) => {
        // Handle IPFS URLs
        if (url.startsWith('ipfs:')) {
          const ipfsHash = url.replace('ipfs:', '');
          const gateway = process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
          return `${gateway}${ipfsHash}`;
        }
        
        // Handle direct IPFS hash
        if (/^[a-zA-Z0-9]{46}$/.test(url)) {
          const gateway = process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
          return `${gateway}${url}`;
        }
        
        // Return URL as is if it's already a valid URL
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        
        return null;
      };

      try {
        // Start with a more targeted query - look for accounts with data entries
        console.log('Querying Stellar accounts...');
        accountsPage = await stellarServer.accounts()
          .limit(50) // Limit results per page
          .call();
      } catch (queryError) {
        console.error('Error in initial accounts query:', queryError);
        
        if (queryError.response && queryError.response.status === 400) {
          // Try a more specific approach - if we have the user's public key, query it directly
          if (publicKey) {
            try {
              console.log('Attempting to query user account directly');
              const userAccount = await stellarServer.loadAccount(publicKey);
              accountsPage = { records: [userAccount], next: null };
            } catch (accountError) {
              console.error('Failed to load user account:', accountError);
              throw new Error('Could not find your Stellar account. Please ensure your wallet is connected properly.');
            }
          } else {
            throw new Error('Bad request when querying accounts. The Stellar network may be experiencing issues.');
          }
        } else {
          // Rethrow for general handling
          throw queryError;
        }
      }
      
      // Process accounts with pagination
      while (accountsPage && accountsPage.records.length > 0 && pageCounter <= maxPages) {
        console.log(`Processing accounts page ${pageCounter}...`);
        
        for (const account of accountsPage.records) {
          const data = account.data_attr;
          if (!data) continue;
          
          // Look for any keys that might contain NFT metadata
          const nftKeys = Object.keys(data).filter(key => 
            key.startsWith('nft_') && key.includes('_metadata')
          );
          
          if (nftKeys.length === 0) continue;
          
          // Process each NFT metadata key
          for (const key of nftKeys) {
            try {
              // Get the base64 encoded metadata value
              const encodedValue = data[key];
              if (!encodedValue) continue;
              
              // Decode the base64 value
              const decodedValue = decodeFromBase64(encodedValue);
              if (!decodedValue) continue;
              
              // Check if the decoded value is a URL or an IPFS hash
              const metadataUrl = processMetadataUrl(decodedValue);
              
              if (metadataUrl) {
                // If it's a URL, fetch the metadata
                try {
                  console.log(`Fetching metadata from: ${metadataUrl}`);
                  const response = await axios.get(metadataUrl, { timeout: 10000 });
                  const metadata = response.data;
                  
                  if (!metadata || typeof metadata !== 'object') {
                    console.warn('Invalid metadata format:', metadata);
                    continue;
                  }
                  
                  // Process image URL if it's IPFS
                  let imageUrl = metadata.image || '';
                  if (imageUrl && imageUrl.includes('ipfs:')) {
                    imageUrl = processMetadataUrl(imageUrl);
                  }
                  
                  nftItems.push({
                    id: `${account.id}-${key}`, // Create a unique ID
                    accountId: account.id,
                    name: metadata.name || 'Unnamed NFT',
                    description: metadata.description || 'No description',
                    image: imageUrl,
                    creator: metadata.creator || account.id,
                    price: metadata.price || '0',
                    assetCode: key.split('_')[1], // Extract asset code from the key
                    likes: likes[account.id] || 0
                  });
                  
                  // Load likes for this item from Pinata if needed
                  if (!likes[account.id]) {
                    const itemLikes = await loadLikesFromPinata(account.id);
                    if (itemLikes > 0) {
                      setLikes(prevLikes => ({
                        ...prevLikes,
                        [account.id]: itemLikes
                      }));
                    }
                  }
                } catch (fetchError) {
                  console.error(`Error fetching metadata from ${metadataUrl}:`, fetchError);
                }
              } else {
                // Try to parse the decoded value as direct JSON
                try {
                  const metadata = JSON.parse(decodedValue);
                  
                  if (!metadata || typeof metadata !== 'object') {
                    console.warn('Invalid metadata format in JSON:', metadata);
                    continue;
                  }
                  
                  // Process image URL if needed
                  let imageUrl = metadata.image || '';
                  if (imageUrl && imageUrl.includes('ipfs:')) {
                    imageUrl = processMetadataUrl(imageUrl);
                  }
                  
                  nftItems.push({
                    id: `${account.id}-${key}`,
                    accountId: account.id,
                    name: metadata.name || 'Unnamed NFT',
                    description: metadata.description || 'No description',
                    image: imageUrl,
                    creator: metadata.creator || account.id,
                    price: metadata.price || '0',
                    assetCode: key.split('_')[1],
                    likes: likes[account.id] || 0
                  });
                } catch (parseError) {
                  console.warn(`Value is not a URL or valid JSON: ${decodedValue.substring(0, 100)}...`);
                }
              }
            } catch (err) {
              console.error(`Error processing NFT key ${key}:`, err);
            }
          }
        }
        
        // Move to next page if available
        if (accountsPage.next && pageCounter < maxPages) {
          try {
            console.log('Fetching next page of accounts...');
            accountsPage = await accountsPage.next();
            pageCounter++;
          } catch (pageError) {
            console.error('Error fetching next page:', pageError);
            break;
          }
        } else {
          break;
        }
      }
      
      console.log(`Found ${nftItems.length} NFTs`);
      
      // Apply filters and sorting
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
      setLoading(false);
    } catch (error) {
      console.error('Error loading NFTs:', error);
      setLoading(false);
      
      // Provide more helpful error messages based on the error type
      let errorMessage = 'Failed to load NFTs';
      
      if (error.response) {
        // Server responded with an error status
        if (error.response.status === 400) {
          errorMessage = 'The Stellar network returned a Bad Request error. Please check your connection and try again.';
        } else if (error.response.status === 404) {
          errorMessage = 'Account not found on the Stellar network.';
        } else if (error.response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
        } else if (error.response.status >= 500) {
          errorMessage = 'The Stellar network is experiencing issues. Please try again later.';
        }
      } else if (error.request) {
        // Request was made but no response
        errorMessage = 'Network connection error. Please check your internet connection.';
      } else if (error.message) {
        // Something else went wrong
        errorMessage = error.message;
      }
      
      toast.error(errorMessage, { 
        position: 'top-center',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true
      });
    }
  };

  const handleLike = async (itemId) => {
    const currentLikes = likes[itemId] || 0;
    const userHasLiked = likedItems[itemId] || false;

    const newLikes = userHasLiked ? currentLikes - 1 : currentLikes + 1;
    setLikes((prevLikes) => ({
      ...prevLikes,
      [itemId]: newLikes
    }));
    setLikedItems((prevLikedItems) => ({
      ...prevLikedItems,
      [itemId]: !userHasLiked
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
  }, [server, selectedFilter, sortOrder]);

  const formatWalletAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 5)}***${address.slice(-4)}`;
  };

  return (
    <div className="home-container">
      {/* Hero Section */}
      <div className="gradient-section">
        <div className="gradient-sphere sphere1"></div>
        <div className="gradient-sphere sphere2"></div>
        <div className="gradient-sphere sphere3"></div>
        <div className="curved-line"></div>
        
        <div className="home-content">
          <div className="home-text">
            <h1 className="Fonteffect">Welcome to Galerie</h1>
            <p>Discover, collect, and trade unique NFTs on the Stellar network</p>
            <div className="home-buttons">
              <button className="create-button" onClick={handleCreateClick}>
                Create NFT
              </button>
              <button className="explore-button" onClick={handleExploreClick}>
                Explore
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* NFT Cards Section */}
      <div ref={nftCardSectionRef} className="NftCardContainer">
        <h2 className="section-title-today">Featured NFTs</h2>
        <div className="filters">
          <div className="filter-options">
            <div className="filter-dropdown">
              <select
                value={selectedFilter || ''}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="filter-button"
              >
                <option value="">Filter By</option>
                <option value="price">Price</option>
                <option value="popularity">Popularity</option>
              </select>
            </div>
            {selectedFilter && (
              <div className="filter-dropdown">
                <select
                  value={sortOrder || ''}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="filter-button"
                >
                  <option value="">Sort Order</option>
                  <option value="highToLow">High to Low</option>
                  <option value="lowToHigh">Low to High</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <img src={loaderGif} alt="Loading..." className="loader" />
          </div>
        ) : items.length > 0 ? (
          <div className="grid">
            {items.map((item, idx) => (
              <div key={idx} className="nft-card">
                <div className="nft-image-container">
                  <button className="like-button" onClick={() => handleLike(item.id)}>
                    <FaHeart className="heart-icon" style={{ color: likedItems[item.id] ? 'red' : 'white' }} />
                    <span>{likes[item.id] || 0}</span>
                  </button>
                  <img src={item.image} alt={item.name} className="nft-card-img" />
                </div>
                <div className="nft-card-body">
                  <h3 className="nft-card-title">{item.name}</h3>
                  <p className="nft-card-description">{item.description}</p>
                  <p className="nft-card-creator">Created By: {formatWalletAddress(item.creator)}</p>
                  <div className="nft-card-actions">
                    <Confetti active={confettiTrigger[item.id]} />
                    <button className="buy-button">Buy Now</button>
                    <button className="place-bid-button">Place Bid</button>
                    <Popup
                      trigger={<button className="share-button">Share</button>}
                      position="center center"
                      closeOnDocumentClick
                      contentStyle={{ padding: '0', border: 'none', width: '300px', height: '200px' }}
                      overlayStyle={{ background: 'rgba(0, 0, 0, 0.5)' }}
                    >
                      {close => (
                        <div className="popup-content-home">
                          <FaTimes className="close-icon-home" onClick={close} />
                        </div>
                      )}
                    </Popup>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-assets">
            <img src={noAssetsGif} alt="No assets" className="no-assets-gif" />
            <p className="lastline">No NFTs available yet</p>
            <button className="create-button" onClick={handleCreateClick}>
              Create Your First NFT
            </button>
          </div>
        )}
      </div>

      <ToastContainer />
    </div>
  );
};

export default HomePage;