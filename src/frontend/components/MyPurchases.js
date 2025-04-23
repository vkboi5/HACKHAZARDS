import { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import loaderGif from './loader.gif';
import './MyPurchases.css';

export default function MyPurchases() {
  const { publicKey, isConnected, server } = useWalletConnect();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  
  const loadPurchasedItems = async () => {
    if (!isConnected || !publicKey) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Create server if not provided
      const stellarServer = server || new StellarSdk.Horizon.Server(
        process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org'
      );
      
      // Load account
      const account = await stellarServer.loadAccount(publicKey);
      
      // Filter for NFT purchase transactions
      const purchaseTransactions = [];
      
      // Look for non-native assets (NFTs) with non-zero balance
      for (const balance of account.balances) {
        if (balance.asset_type !== 'native' && parseFloat(balance.balance) > 0) {
          try {
            // Get asset details
            const asset = new StellarSdk.Asset(balance.asset_code, balance.asset_issuer);
            
            // Get the asset's metadata
            const issuerAccount = await stellarServer.loadAccount(balance.asset_issuer);
            const data = issuerAccount.data;
            const metadataKey = `nft_${balance.asset_code}_metadata`;
            if (data[metadataKey]) {
              const metadataHash = Buffer.from(data[metadataKey], 'base64').toString();
              const metadataUrl = `${process.env.REACT_APP_IPFS_GATEWAY}${metadataHash}`;
              const response = await axios.get(metadataUrl);
              const metadata = response.data;
              
              purchaseTransactions.push({
                id: `${balance.asset_code}-${balance.asset_issuer}`,
                name: metadata.name || balance.asset_code,
                description: metadata.description || 'No description available',
                image: metadata.image || 'https://via.placeholder.com/300',
                price: metadata.price || '0',
                balance: balance.balance
              });
            } else {
              // Fallback if metadata not available
              purchaseTransactions.push({
                id: `${balance.asset_code}-${balance.asset_issuer}`,
                name: balance.asset_code,
                description: 'No description available',
                image: 'https://via.placeholder.com/300',
                price: '0',
                balance: balance.balance
              });
            }
          } catch (error) {
            console.error('Error loading asset details:', error);
          }
        }
      }
      
      setPurchases(purchaseTransactions);
      setLoading(false);
    } catch (error) {
      console.error("Error loading purchased items: ", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && publicKey) {
      loadPurchasedItems();
    } else {
      setLoading(false);
    }
  }, [isConnected, publicKey]);

  if (loading) return (
    <main style={{ padding: "1rem 0", textAlign: 'center' }}>
      <img src={loaderGif} alt="Loading..." style={{ width: '100px', height: '100px' }} />
    </main>
  );

  return (
    <div>
      {purchases.length > 0 ? (
        <div className="gridpurchase">
          {purchases.map((item, idx) => (
            <div key={idx} className="card-custom-purchase">
              <img src={item.image} alt={item.name} className="card-img-purchase" />
              <div className="card-footer-custom-purchase">
                <span className="card-text-purchase">{item.name}</span>
                <span className="card-text-purchase">Balance: {item.balance}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <main className="section-title-no-purchase">
          <h2>No purchases</h2>
        </main>
      )}
    </div>
  );
}