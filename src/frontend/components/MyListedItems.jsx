import React, { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import { useWallet } from '../../contexts/WalletContext';
import { useWeb3Auth } from './Web3AuthProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import Popup from 'reactjs-popup';
import { FaTimes, FaWhatsapp, FaTwitter, FaFacebook, FaLinkedin, FaPinterest, FaTimesCircle, FaShareAlt } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './MyListedItems.css';
import loaderGif from './loader.gif';
import { Container, Row, Col, Card, Button, Alert, Spinner } from 'react-bootstrap';

// Define a local placeholder image as a data URI to avoid external requests
const placeholderImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyBpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzo0MDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBXaW5kb3dzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjQ5MzAyRDQ5MDk5RDExRUJCODZBQzQyRDM0MUE1OThEIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjQ5MzAyRDRBMDk5RDExRUJCODZBQzQyRDM0MUE1OThEIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6NDkzMDJENDcwOTlEMTFFQkI4NkFDNDJEMzQxQTU5OEQiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6NDkzMDJENDgwOTlEMTFFQkI4NkFDNDJEMzQxQTU5OEQiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz7RDHxNAAAABlBMVEXR0dGzs7Pl+2dhAAAAHElEQVR42uzBAQ0AAADCIPuntscHAwAAAAAAAGACEkAAAcuJwlwAAAAASUVORK5CYII=';

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
                e.target.onerror = null; // Prevent infinite loop
                e.target.src = placeholderImg;
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
  const { publicKey: walletConnectPublicKey, isConnected: isWalletConnected, server } = useWalletConnect();
  const { publicKey: walletContextPublicKey, isLoggedIn: isWalletContextLoggedIn } = useWallet();
  const { publicKey: web3AuthPublicKey, isConnected: isWeb3AuthConnected } = useWeb3Auth();
  
  // Combined wallet state - user is authenticated if any method is connected
  const isAuthenticated = isWalletConnected || isWalletContextLoggedIn || isWeb3AuthConnected;
  const publicKey = walletConnectPublicKey || walletContextPublicKey || web3AuthPublicKey;
  
  // Debug authentication state
  useEffect(() => {
    console.log('MyListedItems - Authentication state:', {
      isWalletConnected,
      isWalletContextLoggedIn,
      isWeb3AuthConnected,
      publicKey,
      isAuthenticated
    });
  }, [isWalletConnected, isWalletContextLoggedIn, isWeb3AuthConnected, publicKey, isAuthenticated]);
  
  const [loading, setLoading] = useState(true);
  const [listedItems, setListedItems] = useState([]);
  const [soldItems, setSoldItems] = useState([]);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [error, setError] = useState(null);

  // Function to load listed and sold items from Stellar
  const loadListedItems = async () => {
    if (!isAuthenticated || !publicKey) {
      setLoading(false);
      setError('Please connect your Stellar wallet to view listed items.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Initialize Stellar server
      const stellarServer = server || new StellarSdk.Horizon.Server(
        import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );

      // Get account details
      const account = await stellarServer.loadAccount(publicKey);

      // Get all offers for this account
      const offers = await stellarServer.offers().forAccount(publicKey).call();

      // Create a map of offers for quick lookup
      const offersMap = {};
      offers.records.forEach(offer => {
        if (offer.selling.asset_type !== 'native') {
          const assetCode = offer.selling.asset_code;
          const issuerPublicKey = offer.selling.asset_issuer;
          const key = `${assetCode}-${issuerPublicKey}`;
          
          if (!offersMap[key]) {
            offersMap[key] = [];
          }
          
          offersMap[key].push({
            id: offer.id,
            amount: offer.amount,
            price: offer.price,
          });
        }
      });

      const listedItemsArray = [];
      const soldItemsArray = [];

      // Check manageData entries for NFT metadata
      if (account.data_attr) {
        console.log('Found manageData entries:', Object.keys(account.data_attr));
        for (const [key, value] of Object.entries(account.data_attr)) {
          // Skip non-NFT entries and issued flags
          if (!key.startsWith('nft_') || key.endsWith('_issued')) {
            console.log(`Skipping non-NFT or issued entry: ${key}`);
            continue;
          }

          console.log(`Processing manageData entry: ${key}`);
          let assetCode;
          let metadataValue;

          // Handle metadata entries (e.g., nft_CODE_metadata)
          if (key.endsWith('_metadata')) {
            assetCode = key.replace('nft_', '').replace('_metadata', '');
            metadataValue = value;
            console.log(`Found metadata entry for NFT: ${assetCode}`);
          } else {
            // Handle base entries (e.g., nft_CODE)
            assetCode = key.replace('nft_', '');
            metadataValue = value;
            // Check for a corresponding metadata entry
            const metadataKey = `nft_${assetCode}_metadata`;
            if (account.data_attr[metadataKey]) {
              metadataValue = account.data_attr[metadataKey];
              console.log(`Found and using metadata entry value for NFT: ${assetCode}`);
            } else {
              console.log(`Using base entry value for NFT: ${assetCode}`);
            }
          }

          // Validate asset code
          if (!assetCode || assetCode.length > 12 || assetCode.length < 1) {
            console.log(`Invalid asset code: ${assetCode}, skipping`);
            continue;
          }

          // Check if the NFT was created by this account
          const isCreated = account.data_attr[`nft_${assetCode}_issued`] !== undefined ||
                           account.data_attr[`nft_${assetCode}`] !== undefined ||
                           key === `nft_${assetCode}_metadata`;

          console.log(`NFT Creation check for ${assetCode}:`, {
            hasIssuedFlag: account.data_attr[`nft_${assetCode}_issued`] !== undefined,
            hasBaseEntry: account.data_attr[`nft_${assetCode}`] !== undefined,
            isMetadataEntry: key === `nft_${assetCode}_metadata`,
            finalIsCreated: isCreated,
            assetCode,
            key
          });

          if (!isCreated) {
            console.log(`Skipping NFT ${assetCode} - not created by this account`);
            continue;
          }

          try {
            // Decode the base64 metadata value
            const decodedValue = Buffer.from(metadataValue, 'base64').toString('utf-8');
            console.log(`Decoded metadata value for ${assetCode}: ${decodedValue}`);

            if (!decodedValue) {
              console.log(`No valid decoded value for NFT ${assetCode}, skipping`);
              continue;
            }

            // Find the corresponding asset in balances
            const assetEntry = account.balances.find(
              (b) => b.asset_type !== 'native' && 
                     b.asset_code === assetCode
            );

            console.log(`Processing NFT ${assetCode}:`, {
              hasMetadataInAccount: true,
              hasIssuedFlag: account.data_attr[`nft_${assetCode}_issued`] !== undefined,
              inBalances: assetEntry !== undefined,
              assetIssuer: assetEntry ? assetEntry.asset_issuer : publicKey,
              currentUser: publicKey
            });

            // Set issuer and balance information
            let issuerPublicKey = publicKey; // Default to current user as issuer
            let assetBalance = "0"; // Default balance

            if (assetEntry) {
              console.log(`Found matching asset in balances: ${assetCode}, balance: ${assetEntry.balance}, issuer: ${assetEntry.asset_issuer}`);
              issuerPublicKey = assetEntry.asset_issuer;
              assetBalance = assetEntry.balance;
            } else {
              console.log(`No balance entry found for ${assetCode}, treating as newly created NFT`);
            }

            const assetKey = `${assetCode}-${issuerPublicKey}`;
            const hasOffer = offersMap[assetKey] !== undefined;
            const asset = new StellarSdk.Asset(assetCode, issuerPublicKey);

            // Initialize metadata
            let detailedMetadata = { 
              name: assetCode, 
              image: placeholderImg,
              description: '' 
            };

            // Parse metadata
            const metadata = parseMetadata(decodedValue, assetCode);

            // Fetch detailed metadata if a URL is present
            if (metadata.url) {
              console.log(`Fetching metadata for ${assetCode} from URL: ${metadata.url}`);
              try {
                const response = await axios.get(metadata.url, {
                  timeout: 10000,
                  validateStatus: status => status === 200
                });

                if (response.data) {
                  if (typeof response.data === 'object' && (response.data.name || response.data.image)) {
                    detailedMetadata = {
                      name: response.data.name || metadata.name || assetCode,
                      description: response.data.description || '',
                      image: response.data.image || metadata.url,
                      creator: response.data.creator || publicKey,
                      // Extract price from metadata if available
                      price: response.data.price || metadata.price || ''
                    };

                    // Handle IPFS image URLs
                    if (detailedMetadata.image && !detailedMetadata.image.startsWith('http')) {
                      const gateway = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
                      const formattedGateway = gateway.replace(/\/+$/, '') + '/';
                      detailedMetadata.image = `${formattedGateway}${detailedMetadata.image}`;
                    }
                  } else {
                    detailedMetadata.image = metadata.url;
                    detailedMetadata.name = metadata.name || assetCode;
                    detailedMetadata.price = metadata.price || '';
                  }
                  console.log(`Successfully processed metadata for ${assetCode}:`, detailedMetadata);
                }
              } catch (ipfsError) {
                console.error(`Failed to fetch IPFS metadata for ${assetCode}:`, ipfsError.message);
                detailedMetadata.image = metadata.url;
                detailedMetadata.name = metadata.name || assetCode;
              }
            } else {
              console.log(`No URL found for ${assetCode}, using fallback metadata`);
              detailedMetadata.name = metadata.name || assetCode;
            }

            // Determine status: listed (has offer), sold (balance is 0), or not listed
            const isSold = assetBalance === '0.0000000' || parseFloat(assetBalance) === 0;
            console.log(`Status for ${assetCode}: isSold=${isSold}, hasOffer=${hasOffer}`);
            const item = {
              id: assetCode,
              name: detailedMetadata.name,
              description: detailedMetadata.description,
              image: detailedMetadata.image,
              price: hasOffer ? offersMap[assetKey][0].price : (
                // Check if price is in the metadata
                detailedMetadata.price || metadata.price || '0'
              ),
              offerId: hasOffer ? offersMap[assetKey][0].id : null,
              asset: asset,
              balance: assetBalance,
              issuer: issuerPublicKey,
              isCreator: true,
              hasActiveSellOffer: hasOffer
            };

            console.log(`Categorizing NFT ${assetCode}:`, {
              balance: assetBalance,
              isSold: isSold,
              hasOffer: hasOffer
            });

            // Add to appropriate array
            if (isSold) {
              console.log(`Adding ${assetCode} to sold items (balance is 0)`);
              // Don't override the price when adding to sold items
              soldItemsArray.push(item);
            } else {
              console.log(`Adding ${assetCode} to listed items (hasOffer=${hasOffer})`);
              listedItemsArray.push(item);
            }
          } catch (err) {
            console.error(`Error processing NFT ${key}:`, err.message);
          }
        }
      } else {
        console.log('No manageData entries found in account');
      }

      console.log(`Final listed items:`, listedItemsArray);
      console.log(`Final sold items:`, soldItemsArray);
      setListedItems(listedItemsArray);
      setSoldItems(soldItemsArray);
      setLoading(false);

    } catch (error) {
      console.error('Error loading listed items:', error.message);
      setError('Failed to load your listed items. Please try again later.');
      setLoading(false);
    }
  };

  // Parse metadata string
  const parseMetadata = (metadataStr, assetCode) => {
    const metadata = { name: assetCode, url: '', price: '' };
    console.log(`Parsing metadata string for ${assetCode}: ${metadataStr}`);

    // Check if it's a direct IPFS CID (starting with 'bafk', 'Qm', or 'bafy')
    if (metadataStr.match(/^(bafk|Qm|bafy)/i)) {
      console.log(`Metadata string is an IPFS CID: ${metadataStr}`);
      const gateway = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
      const formattedGateway = gateway.replace(/\/+$/, '') + '/';
      metadata.url = `${formattedGateway}${metadataStr}`;
      console.log(`Constructed IPFS URL: ${metadata.url}`);
      return metadata;
    }

    // Try parsing as "Name: ..., URL: ..., Price: ..." format
    const nameMatch = metadataStr.match(/Name:\s*([^,]+)(?:,|$)/i) || metadataStr.match(/name:\s*([^,]+)(?:,|$)/i);
    const urlMatch = metadataStr.match(/URL:\s*([^\s]+)(?:,|$)/i) || metadataStr.match(/url:\s*([^\s]+)(?:,|$)/i);
    const priceMatch = metadataStr.match(/Price:\s*(\d+(?:\.\d+)?)(?:,|$)/i) || metadataStr.match(/price:\s*(\d+(?:\.\d+)?)(?:,|$)/i);

    if (nameMatch) {
      metadata.name = nameMatch[1].trim();
      console.log(`Extracted name: ${metadata.name}`);
    }

    if (urlMatch) {
      metadata.url = urlMatch[1].trim();
      if (!metadata.url.startsWith('http')) {
        const gateway = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
        const formattedGateway = gateway.replace(/\/+$/, '') + '/';
        metadata.url = `${formattedGateway}${metadata.url}`;
      }
      console.log(`Extracted URL: ${metadata.url}`);
    } else {
      // Fallback: check if metadata contains any text that looks like an IPFS CID
      const cidMatch = metadataStr.match(/(bafk|Qm|bafy)[a-zA-Z0-9]+/i);
      if (cidMatch) {
        const cid = cidMatch[0];
        console.log(`Found possible IPFS CID in metadata: ${cid}`);
        const gateway = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
        const formattedGateway = gateway.replace(/\/+$/, '') + '/';
        metadata.url = `${formattedGateway}${cid}`;
        console.log(`Constructed IPFS URL: ${metadata.url}`);
      } else {
        console.warn('No URL found in metadata and not an IPFS CID');
      }
    }

    if (priceMatch) {
      metadata.price = priceMatch[1].trim();
      console.log(`Extracted price: ${metadata.price} XLM`);
    }

    return metadata;
  };

  // Function to delete an item (remove sell offer)
  const deleteItem = async (item) => {
    try {
      setLoading(true);
      const stellarServer = server || new StellarSdk.Horizon.Server(
        import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );
      const account = await stellarServer.loadAccount(publicKey);
      const asset = new StellarSdk.Asset(item.id, item.issuer);

      console.log('Deleting item:', item);

      // If we don't have an offerId stored in the item, try to find it
      let offerId = item.offerId;
      let offerPrice = "1"; // Default price if not found
      
      if (!offerId) {
        // Fetch existing offers
        const offers = await stellarServer.offers().forAccount(publicKey).call();
        const sellOffer = offers.records.find(
          (offer) =>
            offer.selling.asset_code === item.id &&
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
          import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'
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
      console.error('Error deleting item:', error.message);
      toast.error(`Failed to delete item: ${error.message}`, {
        position: 'top-center',
      });
    } finally {
      setLoading(false);
    }
  };

  // Effect to load items when component mounts or dependencies change
  useEffect(() => {
    loadListedItems();
  }, [isAuthenticated, publicKey]);

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
    <Container>
      <h1>My Listed Items</h1>
      {error && <Alert variant="warning">{error}</Alert>}
      
      {!isAuthenticated ? (
        <Alert variant="info">
          <p>Please connect your Stellar wallet to view listed items.</p>
          <p>You can use Web3Auth login or connect a wallet directly.</p>
        </Alert>
      ) : (
        <div className="flex justify-center">
          <ToastContainer />
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
                            e.target.onerror = null; // Prevent infinite loop
                            e.target.src = placeholderImg;
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
            <div className="no-items-container">
              {loading ? (
                <div className="loading-container">
                  <Spinner animation="border" role="status">
                    <span className="sr-only">Loading...</span>
                  </Spinner>
                  <p>Loading your items...</p>
                </div>
              ) : (
                <Alert variant="info">
                  <p>You don't have any listed or sold items yet.</p>
                </Alert>
              )}
            </div>
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
      )}
    </Container>
  );
}