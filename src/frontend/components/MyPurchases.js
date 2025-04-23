import { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import loaderGif from '../../assets/images/ui/loader.gif';
import './MyPurchases.css';

export default function MyPurchases() {
  const { publicKey, isConnected, server } = useWalletConnect();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState(null);

  const loadPurchasedItems = async () => {
    if (!isConnected || !publicKey) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Initialize Stellar server
      const stellarServer = server || new StellarSdk.Horizon.Server(
        process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );

      // Load user's account
      const account = await stellarServer.loadAccount(publicKey);
      const purchasedItems = [];

      // Iterate through balances to find non-native assets (NFTs)
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
                  : `${process.env.REACT_APP_IPFS_GATEWAY}${metadataHash}`;
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
                ? `${process.env.REACT_APP_IPFS_GATEWAY}${metadata.image}`
                : 'https://via.placeholder.com/300',
              price: metadata.price || '0',
              assetCode,
              issuer,
              balance: balance.balance,
            };

            purchasedItems.push(item);
          } catch (error) {
            console.error(`Error processing asset ${balance.asset_code}:${balance.asset_issuer}`, error);
          }
        }
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
    if (isConnected && publicKey) {
      loadPurchasedItems();
    } else {
      setLoading(false);
      setError('Please connect your Stellar wallet to view purchases.');
    }
  }, [isConnected, publicKey]);

  if (loading) {
    return (
      <main style={{ padding: '1rem 0', textAlign: 'center' }}>
        <img src={loaderGif} alt="Loading..." style={{ width: '100px', height: '100px' }} />
      </main>
    );
  }

  return (
    <div className="my-purchases-container">
      {error && (
        <div className="alert alert-warning text-center" role="alert">
          {error}
        </div>
      )}
      {purchases.length > 0 ? (
        <div className="gridpurchase">
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
              </div>
            </div>
          ))}
        </div>
      ) : (
        <main className="section-title-no-purchase">
          <h2>No purchases</h2>
          <p>You haven't purchased any NFTs yet.</p>
        </main>
      )}
    </div>
  );
}