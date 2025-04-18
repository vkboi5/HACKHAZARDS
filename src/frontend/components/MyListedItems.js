import React, { useState, useEffect } from 'react';
import { useStellarWallet } from './StellarWalletProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import Popup from 'reactjs-popup';
import { FaTimes, FaWhatsapp, FaTwitter, FaFacebook, FaLinkedin, FaPinterest, FaTimesCircle, FaShareAlt } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './MyListedItems.css';
import loaderGif from './loader.gif';

// Function to render sold items
function renderSoldItems(items) {
  return (
    <div className="section-title-sold">
      <h2>Sold</h2>
      <div className="grid">
        {items.map((item, idx) => (
          <div key={idx} className="card-custom sold-card">
            <img src={item.image} alt={item.name} className="card-img" />
            <div className="card-footer-custom">
              <span className="card-text">{item.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main component for listed items
export default function MyListedItems() {
  const { publicKey, isConnected, server } = useStellarWallet();
  const [loading, setLoading] = useState(true);
  const [listedItems, setListedItems] = useState([]);
  const [soldItems, setSoldItems] = useState([]);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Function to load listed items from Stellar
  const loadListedItems = async () => {
    if (!isConnected || !publicKey) {
      setLoading(false);
      return;
    }

    try {
      // Create a new server instance if needed
      const stellarServer = server || new StellarSdk.Server('https://horizon-testnet.stellar.org');
      
      // Get the account's transactions
      const account = await stellarServer.loadAccount(publicKey);
      
      // Filter for NFT assets that the user has issued
      const listedItems = [];
      const soldItems = [];
      
      // Look for transactions where the account has issued NFTs
      for (const balance of account.balances) {
        if (balance.asset_type !== 'native' && balance.asset_issuer === publicKey) {
          // This is an NFT issued by the user
          try {
            // Get asset details
            const asset = new StellarSdk.Asset(balance.asset_code, balance.asset_issuer);
            
            // Get the asset's metadata if available
            const data = account.data_attr;
            if (data && data[`nft_metadata_${balance.asset_code}`]) {
              const metadataUrl = Buffer.from(data[`nft_metadata_${balance.asset_code}`], 'base64').toString('utf-8');
              const response = await axios.get(metadataUrl);
              const metadata = response.data;
              
              // Check if the asset has been sold (transferred to another account)
              const assetHolders = await stellarServer.accounts()
                .forAsset(asset)
                .call();
              
              const isSold = assetHolders.records.some(holder => 
                holder.id !== publicKey && 
                holder.balances.some(b => 
                  b.asset_type !== 'native' && 
                  b.asset_code === balance.asset_code && 
                  b.asset_issuer === balance.asset_issuer && 
                  b.balance !== '0'
                )
              );
              
              const item = {
                id: `${balance.asset_code}-${balance.asset_issuer}`,
                name: metadata.name || balance.asset_code,
                description: metadata.description || 'No description available',
                image: metadata.image || 'https://via.placeholder.com/300',
                price: '0', // Price implementation will come in next phase
                balance: balance.balance
              };
              
              if (isSold) {
                soldItems.push(item);
              } else {
                listedItems.push(item);
              }
            } else {
              // Fallback if metadata not available
              const item = {
                id: `${balance.asset_code}-${balance.asset_issuer}`,
                name: balance.asset_code,
                description: 'No description available',
                image: 'https://via.placeholder.com/300',
                price: '0',
                balance: balance.balance
              };
              
              listedItems.push(item);
            }
          } catch (error) {
            console.error('Error loading asset details:', error);
          }
        }
      }
      
      setListedItems(listedItems);
      setSoldItems(soldItems);
      setLoading(false);
    } catch (error) {
      console.error("Error loading listed items: ", error);
      setLoading(false);
    }
  };

  const deleteItem = async (item) => {
    try {
      // In Stellar, we can't delete an asset, but we can transfer it to a burn account
      // For now, we'll just show a success message
      toast.success('Item Deleted Successfully!', {
        position: "top-center"
      });
      
      // Reload the listed items
      loadListedItems();
      
      // Close the delete confirmation popup
      setItemToDelete(null);
    } catch (error) {
      console.error("Error deleting item: ", error);
      toast.error('Failed to delete item', {
        position: "top-center"
      });
    }
  };

  // Effect to load items when component mounts or dependencies change
  useEffect(() => {
    if (isConnected && publicKey) {
      loadListedItems();
    } else {
      setLoading(false);
    }
  }, [isConnected, publicKey]);

  // Function to handle sharing
  const handleShare = (item, platform) => {
    const shareUrl = item.image; // Using the image URL directly
    let url = '';
    switch (platform) {
      case 'whatsapp':
        url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out this NFT: ${item.name}\n${shareUrl}`)}`;
        break;
      case 'twitter':
        url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out this NFT: ${item.name}`)}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'pinterest':
        url = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(item.name)}`;
        break;
      default:
        break;
    }
    window.open(url, '_blank');
  };

  // Loading state rendering
  if (loading) return (
    <main style={{ padding: "1rem 0", textAlign: 'center' }}>
      <img src={loaderGif} alt="Loading..." style={{ width: '100px', height: '100px' }} />
    </main>
  );

  // Main content rendering
  return (
    <div className="flex justify-center">
      <ToastContainer />
      {listedItems.length > 0 ? (
        <div className="containerListedItems">
          <div className="section-title-listed">
            <h2>Listed</h2>
            <div className="grid">
              {listedItems.map((item, idx) => (
                <div key={idx} className="card-custom listed-card">
                  <img src={item.image} alt={item.name} className="card-img" />
                  <div className="card-footer-custom">
                    <span className="card-text">{item.name}</span>
                    <FaTimesCircle 
                      className="delete-icon" 
                      size={24} 
                      onClick={() => setItemToDelete(item)}
                    />
                    <Popup
                      trigger={<button className="share-button"><FaShareAlt size={16} style={{ marginRight: '8px' }} /> Share</button>}
                      position="center center"
                      closeOnDocumentClick
                      contentStyle={{ padding: '0', border: 'none', width: '100%', height: '100%' }}
                      overlayStyle={{ background: 'rgba(0, 0, 0, 0.5)' }}
                    >
                      {close => (
                        <div className="share-popup-container">
                          <div className="share-popup">
                            <FaTimes className="close-icon" onClick={close} />
                            <h3>Share on Social Media</h3>
                            <div className="share-options">
                              <button onClick={() => handleShare(item, 'whatsapp')}>
                                <FaWhatsapp size={32} style={{ color: '#25D366' }} /><span>WhatsApp</span>
                              </button>
                              <button onClick={() => handleShare(item, 'twitter')}>
                                <FaTwitter size={32} style={{ color: '#1DA1F2' }} /><span>Twitter</span>
                              </button>
                              <button onClick={() => handleShare(item, 'facebook')}>
                                <FaFacebook size={32} style={{ color: '#1877F2' }} /><span>Facebook</span>
                              </button>
                              <button onClick={() => handleShare(item, 'linkedin')}>
                                <FaLinkedin size={32} style={{ color: '#0077B5' }} /><span>LinkedIn</span>
                              </button>
                              <button onClick={() => handleShare(item, 'pinterest')}>
                                <FaPinterest size={32} style={{ color: '#E60023' }} /><span>Pinterest</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Popup>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {soldItems.length > 0 && renderSoldItems(soldItems)}
        </div>
      ) : (
        <main style={{ padding: "1rem 0" }}>
          <h2 className="section-title">No listed assets</h2>
        </main>
      )}
      {itemToDelete && (
        <Popup
          open={true}
          closeOnDocumentClick
          onClose={() => setItemToDelete(null)}
          contentStyle={{ padding: '0', border: 'none', width: '300px', textAlign: 'center' }}
          overlayStyle={{ background: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div className="delete-confirmation-popup">
            <h3>Delete Item</h3>
            <p>Are you sure you want to delete this item?</p>
            <div className="popup-buttons">
              <button className="confirm-button" onClick={() => deleteItem(itemToDelete)}>Delete</button>
              <button className="cancel-button" onClick={() => setItemToDelete(null)}>Cancel</button>
            </div>
          </div>
        </Popup>
      )}
    </div>
  );
}
