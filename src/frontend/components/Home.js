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
import ItemDetailsModal from './ItemDetailsModal';

const PINATA_BASE_URL = 'https://api.pinata.cloud';

const HomePage = ({ marketplace, isConnected, walletBalance }) => {
  const navigate = useNavigate();
  const nftCardSectionRef = useRef(null);
  const { publicKey, isWalletConnected, balanceInXLM, stellarWallet } = useStellarWallet();
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
    try {
      setLoading(true);
      // Use server from context when available, otherwise initialize directly
      const stellarServer = stellarWallet || new StellarSdk.Horizon.Server(
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
        if (url && url.startsWith('ipfs:')) {
          const ipfsHash = url.replace('ipfs:', '');
          const gateway = process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
          return `${gateway}${ipfsHash}`;
        }
        
        // Handle direct IPFS hash
        if (url && /^[a-zA-Z0-9]{46,}$/.test(url)) {
          const gateway = process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
          return `${gateway}${url}`;
        }
        
        // Return URL as is if it's already a valid URL
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          return url;
        }
        
        return url || null;
      };

      // List of accounts to check for NFTs
      const accountsToCheck = [];
      
      // Add connected user's account if available
      if (isConnected && publicKey) {
        accountsToCheck.push(publicKey);
      }
      
      // Add specific account provided
      const specificAccount = 'GAHDNV6A6NSOQM5AMU64NH2LOOAIK474NCGX2FXTXBKD5YUZLTZQKSPV';
      if (!accountsToCheck.includes(specificAccount)) {
        accountsToCheck.push(specificAccount);
      }
      
      // Process each account
      for (const accountId of accountsToCheck) {
        try {
          console.log('Querying account:', accountId);
          const account = await stellarServer.loadAccount(accountId);
          
          const data = account.data_attr;
          if (!data) continue;
          
          // Find all NFT data entries (using our format: nft_{assetCode} and nft_{assetCode}_issued)
          const nftKeys = Object.keys(data).filter(key => 
            key.startsWith('nft_') && !key.endsWith('_issued')
          );
          
          console.log(`Found ${nftKeys.length} potential NFT keys for account ${accountId}`);
          
          if (nftKeys.length === 0) continue;
          
          // Process each NFT key
          for (const key of nftKeys) {
            try {
              // Only process NFTs that are actually issued
              const assetCode = key.replace('nft_', '');
              const issuedKey = `nft_${assetCode}_issued`;
              
              // Check if this NFT is actually issued
              if (!data[issuedKey]) {
                console.log(`NFT ${assetCode} exists but is not issued`);
                continue;
              }
              
              // Get the base64 encoded metadata value
              const encodedValue = data[key];
              if (!encodedValue) continue;
              
              // Decode the base64 value
              const decodedValue = decodeFromBase64(encodedValue);
              if (!decodedValue) continue;
              
              console.log(`Processing NFT ${assetCode} with metadata:`, decodedValue.substring(0, 100));
              
              // Try to extract data from the decoded value
              let nftData = {};
              
              // First check if it's a URL
              const metadataUrl = processMetadataUrl(decodedValue);
              
              if (metadataUrl && (metadataUrl.startsWith('http://') || metadataUrl.startsWith('https://'))) {
                // If it's a URL, fetch the metadata
                try {
                  console.log(`Fetching metadata from: ${metadataUrl}`);
                  const response = await axios.get(metadataUrl, { timeout: 10000 });
                  nftData = response.data;
                } catch (fetchError) {
                  console.error(`Error fetching metadata from ${metadataUrl}:`, fetchError);
                  // Try to parse decodedValue as metadata string in format "Name: X, URL: Y"
                  const namePart = decodedValue.match(/Name: ([^,]*)/);
                  const urlPart = decodedValue.match(/URL: (.*)/);
                  
                  if (namePart && urlPart) {
                    nftData = {
                      name: namePart[1].trim(),
                      image: processMetadataUrl(urlPart[1].trim())
                    };
                  }
                }
              } else {
                // Try to parse the decoded value directly
                // First as JSON
                try {
                  nftData = JSON.parse(decodedValue);
                } catch (parseError) {
                  // Try to parse as our custom format "Name: X, URL: Y"
                  const namePart = decodedValue.match(/Name: ([^,]*)/);
                  const urlPart = decodedValue.match(/URL: (.*)/);
                  
                  if (namePart && urlPart) {
                    nftData = {
                      name: namePart[1].trim(),
                      image: processMetadataUrl(urlPart[1].trim())
                    };
                  } else {
                    console.warn(`Unable to parse metadata: ${decodedValue.substring(0, 100)}...`);
                    continue;
                  }
                }
              }
              
              // If we successfully extracted data, create the NFT item
              if (nftData) {
                // Process image URL if needed
                let imageUrl = nftData.image || '';
                imageUrl = processMetadataUrl(imageUrl);
                
                console.log(`Adding NFT to display: ${assetCode}`, {
                  name: nftData.name,
                  image: imageUrl.substring(0, 50) + '...',
                });
                
                nftItems.push({
                  id: `${account.id}-${key}`,
                  accountId: account.id,
                  name: nftData.name || 'Unnamed NFT',
                  description: nftData.description || 'No description',
                  image: imageUrl,
                  creator: nftData.creator || account.id,
                  price: nftData.price || '0',
                  assetCode: assetCode,
                  likes: likes[account.id] || 0,
                  itemId: `${account.id}-${assetCode}`
                });
              }
            } catch (err) {
              console.error(`Error processing NFT key ${key}:`, err);
            }
          }
        } catch (accountError) {
          console.error(`Failed to load account ${accountId}:`, accountError);
        }
      }
      
      console.log(`Found ${nftItems.length} NFTs in total`);
      
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
    if (!itemId) return;
    
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
  }, [stellarWallet, selectedFilter, sortOrder]);

  const formatWalletAddress = (address) => {
    if (!address) return '';
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

    // For demonstration purposes, just show a success toast
    // In a real implementation, you would:
    // 1. Create a Stellar transaction to place the bid
    // 2. Sign the transaction with the user's Stellar wallet
    // 3. Submit the transaction to the Stellar network
    // 4. Update the UI with the new bid status

    toast.success(`Bid of ${amount} XLM placed successfully on ${selectedItem.name}!`, {
      position: 'top-center'
    });

    // Reset bid amount and close modal
    setBidAmount('');
    setShowModal(false);
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
              <button className="explore-button" onClick={() => window.scrollTo({ top: document.querySelector('.white-section').offsetTop, behavior: 'smooth' })}>
                Explore
              </button>
              <button className="create-button" onClick={() => navigate('/create')}>
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
                  .filter((item) =>
                    item.name.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item, idx) => (
                    <div key={idx} className="NftCard">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="NftCardImage"
                      />
                      <div className="NftCardContent">
                        <h3 className="NftCardTitle">{item.name}</h3>
                        <p className="NftCardDescription">{item.description}</p>
                        <div className="account-badge">
                          {item.accountId === 'GAHDNV6A6NSOQM5AMU64NH2LOOAIK474NCGX2FXTXBKD5YUZLTZQKSPV' && 
                            <span className="badge bg-info">
                              <small>Featured Collection</small>
                            </span>
                          }
                          {item.accountId === publicKey && 
                            <span className="badge bg-success">
                              <small>Your Collection</small>
                            </span>
                          }
                          <span className="badge bg-light text-dark">
                            <small>Owner: {formatWalletAddress(item.accountId)}</small>
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="NftCardPrice">
                            {item.price || '0'} XLM
                          </span>
                          <div>
                            <button
                              className="btn btn-outline-danger btn-sm me-2"
                              onClick={() => handleLike(item.itemId)}
                            >
                              <FaHeart style={{ color: likedItems[item.itemId] ? '#dc3545' : 'inherit' }} /> {likes[item.itemId] || 0}
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
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate("/create")}
                  >
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
          isConnected={isConnected}
        />
      )}
    </div>
  );
};

export default HomePage;