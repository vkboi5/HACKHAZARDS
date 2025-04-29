import { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import { useWallet } from '../../contexts/WalletContext';
import { useWeb3Auth } from './Web3AuthProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import loaderGif from './loader.gif';
import './MyPurchases.css';
import { Alert, Container } from 'react-bootstrap';

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
                : 'https://via.placeholder.com/300',
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
            image: wonBid.image || 'https://via.placeholder.com/300',
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
                image: 'https://via.placeholder.com/300',
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
                        e.target.src = 'https://via.placeholder.com/300';
                      }}
                    />
                    <div className="card-footer-custom-purchase">
                      <span className="card-text-purchase">{item.name}</span>
                      <span className="card-text-purchase">Price: {item.price} XLM</span>
                      <span className="card-text-purchase">Balance: {item.balance}</span>
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