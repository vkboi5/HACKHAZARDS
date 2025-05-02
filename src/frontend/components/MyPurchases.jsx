import { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import { useWallet } from '../../contexts/WalletContext';
import { useWeb3Auth } from './Web3AuthProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import loaderGif from './loader.gif';
import './MyPurchases.css';
import { Alert, Container } from 'react-bootstrap';

// Define a local placeholder image as a data URI to avoid external requests
const placeholderImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyBpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzo0MDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBXaW5kb3dzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjQ5MzAyRDQ5MDk5RDExRUJCODZBQzQyRDM0MUE1OThEIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjQ5MzAyRDRBMDk5RDExRUJCODZBQzQyRDM0MUE1OThEIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6NDkzMDJENDcwOTlEMTFFQkI4NkFDNDJEMzQxQTU5OEQiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6NDkzMDJENDgwOTlEMTFFQkI4NkFDNDJEMzQxQTU5OEQiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz7RDHxNAAAABlBMVEXR0dGzs7Pl+2dhAAAAHElEQVR42uzBAQ0AAADCIPuntscHAwAAAAAAAGACEkAAAcuJwlwAAAAASUVORK5CYII=';

export default function MyPurchases() {
  const { publicKey: walletConnectPublicKey, isConnected: isWalletConnected, server } = useWalletConnect();
  const { publicKey: walletContextPublicKey, isLoggedIn: isWalletContextLoggedIn } = useWallet();
  const { publicKey: web3AuthPublicKey, isConnected: isWeb3AuthConnected } = useWeb3Auth();
  
  // Combined wallet state - user is authenticated if any method is connected
  const isAuthenticated = isWalletConnected || isWalletContextLoggedIn || isWeb3AuthConnected;
  const publicKey = walletConnectPublicKey || walletContextPublicKey || web3AuthPublicKey;
  
  // Debug authentication state
  useEffect(() => {
    console.log('MyPurchases - Authentication state:', {
      isWalletConnected,
      isWalletContextLoggedIn,
      isWeb3AuthConnected,
      publicKey,
      isAuthenticated
    });
  }, [isWalletConnected, isWalletContextLoggedIn, isWeb3AuthConnected, publicKey, isAuthenticated]);
  
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState(null);

  const loadPurchasedItems = async () => {
    if (!isAuthenticated || !publicKey) {
      setLoading(false);
      setError('Please connect your Stellar wallet to view purchases.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Initialize Stellar server
      const stellarServer = server || new StellarSdk.Horizon.Server(
        import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );

      // Load user's account
      const account = await stellarServer.loadAccount(publicKey);
      const purchasedItems = [];

      // 1. Check for NFTs in user's balances
      for (const balance of account.balances) {
        if (balance.asset_type !== 'native' && parseFloat(balance.balance) > 0) {
          try {
            const assetCode = balance.asset_code;
            const issuer = balance.asset_issuer;

            // Load issuer's account to get metadata
            let metadata = {};
            try {
              const issuerAccount = await stellarServer.loadAccount(issuer);
              const metadataKey = `nft_${assetCode}_metadata`;
              if (issuerAccount.data_attr[metadataKey]) {
                const metadataHash = Buffer.from(issuerAccount.data_attr[metadataKey], 'base64').toString();
                const metadataUrl = metadataHash.startsWith('http')
                  ? metadataHash
                  : `${import.meta.env.VITE_IPFS_GATEWAY}${metadataHash}`;
                const response = await axios.get(metadataUrl, { timeout: 10000 });
                metadata = response.data;
              } else {
                console.warn(`No metadata found for asset ${assetCode}:${issuer}`);
              }
            } catch (metadataError) {
              console.error(`Error fetching metadata for ${assetCode}:${issuer}`, metadataError);
            }

            // Construct item data
            const item = {
              id: `${assetCode}-${issuer}`,
              name: metadata.name || assetCode,
              description: metadata.description || 'No description available',
              image: metadata.image && metadata.image.startsWith('http')
                ? metadata.image
                : metadata.image
                ? `${import.meta.env.VITE_IPFS_GATEWAY}${metadata.image}`
                : placeholderImg,
              price: metadata.price || '0',
              assetCode,
              issuer,
              balance: balance.balance,
              source: 'account_balance'
            };

            purchasedItems.push(item);
          } catch (error) {
            console.error(`Error processing asset ${balance.asset_code}:${balance.asset_issuer}`, error);
          }
        }
      }

      // 2. Check localStorage for recently accepted bids (for a better UX before blockchain confirmation)
      try {
        const salesHistory = JSON.parse(localStorage.getItem('nftSales') || '[]');
        const myWonBids = salesHistory.filter(sale => 
          sale.buyer === publicKey && 
          sale.saleType === 'bid_accepted' &&
          !purchasedItems.some(item => item.assetCode === sale.assetCode)
        );
        
        for (const wonBid of myWonBids) {
          purchasedItems.push({
            id: `${wonBid.assetCode}-pending`,
            name: wonBid.name || wonBid.assetCode,
            description: 'Transaction processing...',
            image: wonBid.image || placeholderImg,
            price: wonBid.price || '0',
            assetCode: wonBid.assetCode,
            issuer: wonBid.seller,
            balance: '1',
            status: 'pending',
            source: 'local_storage'
          });
        }
      } catch (storageError) {
        console.error('Error reading sales from localStorage:', storageError);
      }

      // 3. Check for bids that were accepted using Pinata data (fallback)
      try {
        const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
        const PINATA_API_SECRET = import.meta.env.VITE_PINATA_API_SECRET;
        const PINATA_BASE_URL = 'https://api.pinata.cloud';
        
        if (PINATA_API_KEY && PINATA_API_SECRET) {
          const response = await axios.get(`${PINATA_BASE_URL}/data/pinList`, {
            params: {
              status: 'pinned',
              'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
              'metadata[keyvalues][type]': JSON.stringify({ value: 'sale', op: 'eq' }),
              'metadata[keyvalues][buyer]': JSON.stringify({ value: publicKey, op: 'eq' }),
              pageLimit: 100,
            },
            headers: {
              pinata_api_key: PINATA_API_KEY,
              pinata_secret_api_key: PINATA_API_SECRET,
            },
          });

          const pinataItems = response.data.rows;
          console.log(`Found ${pinataItems.length} sales for buyer ${publicKey} in Pinata`);

          for (const item of pinataItems) {
            try {
              const ipfsHash = item.ipfs_pin_hash;
              const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
              const metadataUrl = `${IPFS_GATEWAY}${ipfsHash}`;
              const metadataResponse = await axios.get(metadataUrl);
              const saleData = metadataResponse.data;

              // Skip if we already have this NFT in our list
              if (purchasedItems.some(p => p.assetCode === saleData.nftAssetCode)) {
                continue;
              }

              // Add this sale to our purchases
              purchasedItems.push({
                id: `${saleData.nftAssetCode}-pinata`,
                name: saleData.nftAssetCode,
                description: 'Details will be available soon',
                image: placeholderImg,
                price: saleData.price || '0',
                assetCode: saleData.nftAssetCode,
                issuer: saleData.issuerPublicKey,
                balance: '1',
                status: 'processing',
                source: 'pinata'
              });
            } catch (itemError) {
              console.error(`Error processing sale item ${item.ipfs_pin_hash}:`, itemError);
            }
          }
        }
      } catch (pinataError) {
        console.error('Pinata fetch error:', pinataError);
      }

      console.log(`Found ${purchasedItems.length} purchased NFTs`);
      setPurchases(purchasedItems);
      setLoading(false);

      if (purchasedItems.length === 0) {
        setError('No purchased NFTs found.');
      }
    } catch (error) {
      console.error('Error loading purchased items:', error);
      setError(`Failed to load purchased NFTs: ${error.message}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchasedItems();
  }, [isAuthenticated, publicKey]);

  // Add a listener for the nftPurchased event
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'nftPurchased') {
        console.log('NFT purchase detected, refreshing list...');
        loadPurchasedItems();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <Container>
      <h1>My Purchases</h1>
      {error && <Alert variant="warning">{error}</Alert>}
      
      {!isAuthenticated ? (
        <Alert variant="info">
          <p>Please connect your Stellar wallet to view purchases.</p>
          <p>You can use Web3Auth login or connect a wallet directly.</p>
        </Alert>
      ) : (
        <div className="flex justify-center">
          {loading ? (
            <div className="centered-container">
              <img src={loaderGif} className="loader" alt="Loading..." />
              <p>Loading your NFTs...</p>
            </div>
          ) : purchases.length > 0 ? (
            <div className="purchases">
              <div className="grid">
                {purchases.map((item, idx) => (
                  <div key={idx} className="card-custom-purchase">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="card-img-purchase"
                      onError={(e) => {
                        e.target.onerror = null; // Prevent infinite loop
                        e.target.src = placeholderImg;
                      }}
                    />
                    <div className="card-footer-custom-purchase">
                      <span className="card-text-purchase">{item.name}</span>
                      <span className="card-text-purchase">Price: {item.price} XLM</span>
                      {item.status === 'pending' && (
                        <span className="card-text-purchase status-pending">Status: Processing</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="no-items">
              <h2>No purchases found</h2>
              <p>NFTs you purchase will appear here.</p>
            </div>
          )}
        </div>
      )}
    </Container>
  );
}