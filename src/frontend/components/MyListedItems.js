import React, { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import Popup from 'reactjs-popup';
import { FaTimes, FaWhatsapp, FaTwitter, FaFacebook, FaLinkedin, FaPinterest, FaTimesCircle, FaShareAlt } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './MyListedItems.css';
import loaderGif from '../../assets/images/ui/loader.gif';
import { Container, Row, Col, Card, Button, Alert, Spinner } from 'react-bootstrap';

// Function to render sold items
function renderSoldItems(items) {
  return (
    <div className="section-title-sold">
      <h2>Sold</h2>
      <div className="grid">
        {items.map((item, idx) => (
          <div key={idx} className="card-custom sold-card">
            <img
              src={item.image}
              alt={item.name}
              className="card-img"
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/300';
              }}
            />
            <div className="card-footer-custom">
              <span className="card-text">{item.name}</span>
              <span className="card-text">Sold for: {item.price} XLM</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main component for listed items
export default function MyListedItems() {
  const { publicKey, isConnected, server } = useWalletConnect();
  const [loading, setLoading] = useState(true);
  const [listedItems, setListedItems] = useState([]);
  const [soldItems, setSoldItems] = useState([]);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [error, setError] = useState(null);

  // Function to load listed and sold items from Stellar
  const loadListedItems = async () => {
    if (!isConnected || !publicKey) {
      setLoading(false);
      setError('Please connect your Stellar wallet to view listed items.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Initialize Stellar server
      const stellarServer = server || new StellarSdk.Horizon.Server(
        process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );

      // List of asset codes to exclude - common test tokens
      const excludedAssetCodes = ['AQUA', 'BTC', 'ETH', 'USDC', 'USDT', 'asdasd'];
      
      // Load user's account
      const account = await stellarServer.loadAccount(publicKey);
      const listedItems = [];
      const soldItems = [];

      console.log('Loading NFTs for account:', publicKey);
      console.log('Account balances:', account.balances);
      
      // Fetch all offers for the account first to avoid multiple API calls
      let allOffers = [];
      try {
        const offersResponse = await stellarServer.offers().forAccount(publicKey).limit(100).call();
        allOffers = offersResponse.records || [];
        console.log(`Found ${allOffers.length} active offers for account`, allOffers);
      } catch (offersError) {
        console.error('Error fetching offers:', offersError);
      }

      // Build a map of asset offers for quick lookup
      const offersMap = {};
      allOffers.forEach(offer => {
        if (offer.selling.asset_type !== 'native' && offer.buying.asset_type === 'native') {
          const key = `${offer.selling.asset_code}-${offer.selling.asset_issuer}`;
          offersMap[key] = {
            price: offer.price,
            amount: offer.amount,
            id: offer.id
          };
          console.log(`Offer for ${key}: price=${offer.price}, amount=${offer.amount}, id=${offer.id}`);
        }
      });

      // Fetch all NFT asset holders (accounts that hold NFTs issued by this user)
      let assetHolders = [];
      try {
        // Only fetch if there are assets issued by this account
        if (account.balances.some(b => b.asset_type !== 'native' && b.asset_issuer === publicKey)) {
          const nftHolders = await stellarServer.accounts()
            .forSigner(publicKey)  // Accounts related to this user
            .limit(50)
            .call();
          assetHolders = nftHolders.records || [];
          console.log(`Found ${assetHolders.length} accounts holding assets issued by this account`);
        }
      } catch (holdersError) {
        console.error('Error fetching asset holders:', holdersError);
      }

      // Helper to check if an asset is owned by someone else
      const isAssetHeldByOthers = (assetCode) => {
        return assetHolders.some(
          holder => holder.id !== publicKey && 
            holder.balances.some(
              b => b.asset_type !== 'native' && 
                   b.asset_code === assetCode && 
                   b.asset_issuer === publicKey &&
                   parseFloat(b.balance) > 0
            )
        );
      };

      // Helper to check if this is a valid NFT asset rather than a standard token
      const isValidNftAsset = (assetCode, issuerPublicKey, isCreator, metadata) => {
        // Skip excluded asset codes (common test tokens)
        if (excludedAssetCodes.includes(assetCode)) {
          console.log(`Skipping excluded asset: ${assetCode}`);
          return false;
        }
        
        // If this is a created NFT with metadata, it's probably valid
        if (isCreator && metadata && (metadata.name || metadata.image)) {
          return true;
        }
        
        // If it has NFT-like metadata but isn't in the exclude list, consider it valid
        if (metadata && metadata.image) {
          return true;
        }
        
        // For assets without metadata, only include if they have active offers
        // or if we're the creator
        if (isCreator) {
          return true;
        }

        const assetKey = `${assetCode}-${issuerPublicKey}`;
        return offersMap[assetKey] !== undefined;
      };

      // Iterate through balances to find all non-native assets (both created and held NFTs)
      for (const balance of account.balances) {
        if (balance.asset_type !== 'native') {
          try {
            const assetCode = balance.asset_code;
            const issuerPublicKey = balance.asset_issuer;
            const asset = new StellarSdk.Asset(assetCode, issuerPublicKey);
            const isCreator = issuerPublicKey === publicKey;
            const assetKey = `${assetCode}-${issuerPublicKey}`;
            const hasOffer = offersMap[assetKey] !== undefined;
            
            console.log(`Processing asset: ${assetCode}:${issuerPublicKey}, balance: ${balance.balance}, isCreator: ${isCreator}, hasOffer: ${hasOffer}`);

            // Skip if balance is zero and not the creator (no need to show)
            if (parseFloat(balance.balance) === 0 && !isCreator) {
              console.log(`Skipping asset ${assetCode} with zero balance`);
              continue;
            }
            
            // Skip excluded asset codes before fetching metadata
            if (excludedAssetCodes.includes(assetCode)) {
              console.log(`Skipping excluded asset: ${assetCode}`);
              continue;
            }

            // Fetch the issuer account to get metadata
            const issuerAccount = issuerPublicKey === publicKey 
              ? account 
              : await stellarServer.loadAccount(issuerPublicKey);

            // Fetch metadata
            let metadata = {};
            try {
              const metadataKey = `nft_${assetCode}_metadata`;
              if (issuerAccount.data_attr && issuerAccount.data_attr[metadataKey]) {
                const metadataHash = Buffer.from(issuerAccount.data_attr[metadataKey], 'base64').toString();
                console.log(`Found metadata hash for ${assetCode}:`, metadataHash);
                const metadataUrl = metadataHash.startsWith('http')
                  ? metadataHash
                  : `${process.env.REACT_APP_IPFS_GATEWAY}${metadataHash}`;
                console.log(`Fetching metadata from:`, metadataUrl);
                const response = await axios.get(metadataUrl, { timeout: 10000 });
                metadata = response.data;
                console.log(`Metadata for ${assetCode}:`, metadata);
              } else {
                console.warn(`No metadata found for asset ${assetCode}`);
              }
            } catch (metadataError) {
              console.error(`Error fetching metadata for ${assetCode}`, metadataError);
            }
            
            // Skip if it's not a valid NFT asset
            if (!isValidNftAsset(assetCode, issuerPublicKey, isCreator, metadata)) {
              console.log(`Skipping non-NFT asset: ${assetCode}`);
              continue;
            }

            // Check if the NFT is sold to someone else (if user is the creator)
            let isSold = false;
            if (isCreator) {
              isSold = isAssetHeldByOthers(assetCode);
              console.log(`Asset ${assetCode} isSold:`, isSold);
            }

            // Get the current price from active offers
            let currentPrice = '0';
            let hasActiveSellOffer = false;
            
            if (hasOffer) {
              hasActiveSellOffer = true;
              currentPrice = offersMap[assetKey].price;
              console.log(`Asset ${assetCode} has active offer with price:`, currentPrice);
            }

            // If there's no active offer but metadata has a price, use that as fallback
            if (currentPrice === '0' && metadata.price) {
              currentPrice = metadata.price;
              console.log(`Using metadata price for ${assetCode}:`, currentPrice);
            }

            // Construct item data
            const item = {
              id: `${assetCode}-${issuerPublicKey}`,
              name: metadata.name || assetCode,
              description: metadata.description || 'No description available',
              image: metadata.image && metadata.image.startsWith('http')
                ? metadata.image
                : metadata.image
                ? `${process.env.REACT_APP_IPFS_GATEWAY}${metadata.image}`
                : 'https://via.placeholder.com/300',
              price: currentPrice,
              assetCode,
              issuer: issuerPublicKey,
              balance: balance.balance,
              isCreator,
              hasActiveSellOffer,
              offerId: hasOffer ? offersMap[assetKey].id : null
            };

            // For creator assets: show in "sold" if sold to someone else
            // For held assets: show in "listed" if user has an active sell offer, else consider it a collectible
            if (isCreator && isSold) {
              soldItems.push(item);
            } else if (hasActiveSellOffer || (isCreator && !isSold)) {
              listedItems.push(item);
            } else {
              // This is a collectible
              listedItems.push(item);
            }
          } catch (error) {
            console.error(`Error processing asset ${balance.asset_code}`, error);
          }
        }
      }

      console.log(`Found ${listedItems.length} listed NFTs and ${soldItems.length} sold NFTs`);
      setListedItems(listedItems);
      setSoldItems(soldItems);
      setLoading(false);

      if (listedItems.length === 0 && soldItems.length === 0) {
        setError('No created or owned NFTs found.');
      }
    } catch (error) {
      console.error('Error loading listed items:', error);
      setError(`Failed to load NFTs: ${error.message}`);
      setLoading(false);
    }
  };

  // Function to delete an item (remove sell offer)
  const deleteItem = async (item) => {
    try {
      setLoading(true);
      const stellarServer = server || new StellarSdk.Horizon.Server(
        process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );
      const account = await stellarServer.loadAccount(publicKey);
      const asset = new StellarSdk.Asset(item.assetCode, item.issuer);

      console.log('Deleting item:', item);

      // If we don't have an offerId stored in the item, try to find it
      let offerId = item.offerId;
      let offerPrice = "1"; // Default price if not found
      
      if (!offerId) {
        // Fetch existing offers
        const offers = await stellarServer.offers().forAccount(publicKey).call();
        const sellOffer = offers.records.find(
          (offer) =>
            offer.selling.asset_code === item.assetCode &&
            offer.selling.asset_issuer === item.issuer &&
            offer.buying.asset_type === 'native'
        );

        if (!sellOffer) {
          throw new Error('No sell offer found for this NFT.');
        }
        
        offerId = sellOffer.id;
        offerPrice = sellOffer.price;
      } else {
        // Try to get the latest offer details to get the price
        try {
          const offer = await stellarServer.offers().offer(offerId).call();
          offerPrice = offer.price;
        } catch (error) {
          console.log(`Couldn't fetch offer details, using default price: ${error.message}`);
          // Use the item price if it exists
          if (item.price && item.price !== '0') {
            offerPrice = item.price;
          }
        }
      }

      console.log(`Removing offer ${offerId} with price ${offerPrice}`);

      // Create transaction to remove the sell offer
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase:
          process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
            ? StellarSdk.Networks.TESTNET
            : StellarSdk.Networks.PUBLIC,
      })
        .addOperation(
          StellarSdk.Operation.manageSellOffer({
            selling: asset,
            buying: StellarSdk.Asset.native(),
            amount: '0', // Setting amount to 0 removes the offer
            price: offerPrice,
            offerId: offerId,
          })
        )
        .setTimeout(180)
        .build();

      const xdr = transaction.toXDR();
      console.log('Submitting transaction to remove offer:', xdr);
      
      // Use window.signAndSubmitTransaction if available, otherwise fall back to WalletConnectProvider
      let result;
      if (typeof window.signAndSubmitTransaction === 'function') {
        result = await window.signAndSubmitTransaction(xdr);
      } else {
        throw new Error('signAndSubmitTransaction function not available');
      }

      console.log('Transaction result:', result);
      toast.success('Item removed from listing successfully!', {
        position: 'top-center',
      });

      // Reload items
      await loadListedItems();
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error(`Failed to delete item: ${error.message}`, {
        position: 'top-center',
      });
    } finally {
      setLoading(false);
    }
  };

  // Effect to load items when component mounts or dependencies change
  useEffect(() => {
    if (isConnected && publicKey) {
      loadListedItems();
    } else {
      setLoading(false);
      setError('Please connect your Stellar wallet to view listed items.');
    }
  }, [isConnected, publicKey]);

  // Function to handle sharing
  const handleShare = (item, platform) => {
    const shareUrl = item.image;
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
  if (loading) {
    return (
      <main style={{ padding: '1rem 0', textAlign: 'center' }}>
        <img src={loaderGif} alt="Loading..." style={{ width: '100px', height: '100px' }} />
      </main>
    );
  }

  // Main content rendering
  return (
    <div className="flex justify-center">
      <ToastContainer />
      {error && (
        <div className="alert alert-warning text-center" role="alert">
          {error}
        </div>
      )}
      {listedItems.length > 0 || soldItems.length > 0 ? (
        <div className="containerListedItems">
          {listedItems.length > 0 && (
            <div className="section-title-listed">
              <h2>Listed Items</h2>
              <div className="grid">
                {listedItems.map((item, idx) => (
                  <div key={idx} className="card-custom listed-card">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="card-img"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/300';
                      }}
                    />
                    <div className="card-badge-container">
                      {item.isCreator && (
                        <span className="card-badge creator-badge">Creator</span>
                      )}
                      {!item.isCreator && (
                        <span className="card-badge collector-badge">Collected</span>
                      )}
                      {item.hasActiveSellOffer && (
                        <span className="card-badge sale-badge">For Sale</span>
                      )}
                    </div>
                    <div className="card-footer-custom">
                      <div className="card-info">
                        <span className="card-title">{item.name}</span>
                        {item.hasActiveSellOffer ? (
                          <span className="card-price">Listed: {item.price} XLM</span>
                        ) : (
                          item.price && item.price !== '0' ? (
                            <span className="card-price">Value: {item.price} XLM</span>
                          ) : (
                            <span className="card-price">Not Listed</span>
                          )
                        )}
                      </div>
                      <div className="card-actions">
                        {(item.hasActiveSellOffer || item.isCreator) && (
                          <FaTimesCircle
                            className="delete-icon"
                            size={24}
                            onClick={() => setItemToDelete(item)}
                            title={item.hasActiveSellOffer ? "Remove from sale" : "Delete NFT"}
                          />
                        )}
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
                  </div>
                ))}
              </div>
            </div>
          )}
          {soldItems.length > 0 && renderSoldItems(soldItems)}
        </div>
      ) : (
        <main style={{ padding: '1rem 0' }}>
          <h2 className="section-title">No NFTs Found</h2>
          <p>You haven't created or collected any NFTs yet.</p>
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
            <p>Are you sure you want to remove this item from listing?</p>
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