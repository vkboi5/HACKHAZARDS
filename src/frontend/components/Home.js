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
      // Initialize the Stellar server directly
      const stellarServer = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
      
      // Query all accounts that have NFT metadata
      const accounts = await stellarServer.accounts()
        .call();
      
      const nftItems = [];
      
      for (const account of accounts.records) {
        const data = account.data_attr;
        if (data) {
          // Look for any keys that might contain NFT metadata
          const nftKeys = Object.keys(data).filter(key => 
            key.startsWith('nft_') && key.includes('_metadata')
          );
          
          for (const key of nftKeys) {
            try {
              // Get the metadata URL or value
              const metadataValue = data[key];
              
              // If it's a URL, fetch the metadata
              if (metadataValue.startsWith('http')) {
                try {
                  const response = await axios.get(metadataValue);
                  const metadata = response.data;
                  
                  nftItems.push({
                    id: account.id,
                    name: metadata.name || 'Unnamed NFT',
                    description: metadata.description || 'No description',
                    image: metadata.image || '',
                    creator: account.id,
                    price: '0', // Price implementation will come in next phase
                    likes: likes[account.id] || 0
                  });
                } catch (fetchError) {
                  console.error('Error fetching metadata:', fetchError);
                }
              } else {
                // If it's not a URL, try to decode it as base64 JSON
                try {
                  const decodedData = Buffer.from(metadataValue, 'base64').toString('utf-8');
                  const metadata = JSON.parse(decodedData);
                  
                  nftItems.push({
                    id: account.id,
                    name: metadata.name || 'Unnamed NFT',
                    description: metadata.description || 'No description',
                    image: metadata.image || '',
                    creator: account.id,
                    price: '0',
                    likes: likes[account.id] || 0
                  });
                } catch (decodeError) {
                  console.error('Error decoding metadata:', decodeError);
                }
              }
            } catch (err) {
              console.error(`Error processing NFT key ${key}:`, err);
            }
          }
        }
      }

      // Apply filters and sorting
      let filteredItems = [...nftItems];
      
      if (selectedFilter && sortOrder) {
        filteredItems.sort((a, b) => {
          if (selectedFilter === 'price') {
            return sortOrder === 'highToLow' ? b.price - a.price : a.price - b.price;
          } else if (selectedFilter === 'popularity') {
            return sortOrder === 'highToLow' ? b.likes - a.likes : a.likes - b.likes;
          }
          return 0;
        });
      }

      setItems(filteredItems);
      setLoading(false);
    } catch (error) {
      console.error('Error loading NFTs:', error);
      setLoading(false);
      toast.error('Failed to load NFTs', { position: 'top-center' });
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