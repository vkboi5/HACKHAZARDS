import React, { createContext, useContext, useState, useEffect } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';

// Create a context for the Stellar wallet
const StellarWalletContext = createContext();

// Custom hook to use the Stellar wallet context
export function useStellarWallet() {
  return useContext(StellarWalletContext);
}

export function StellarWalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [server, setServer] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [inputPublicKey, setInputPublicKey] = useState('');

  // Initialize the Stellar server
  useEffect(() => {
    try {
      // Use testnet for development
      const stellarServer = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
      setServer(stellarServer);
      
      // Check if we have a stored public key
      const storedPublicKey = localStorage.getItem('stellarPublicKey');
      if (storedPublicKey) {
        setPublicKey(storedPublicKey);
        setIsConnected(true);
      }
    } catch (err) {
      setError(`Failed to initialize Stellar server: ${err.message}`);
    }
  }, []);

  // Connect to a Stellar wallet
  const connectWallet = async () => {
    try {
      // Check for public key in .env file first
      const envPublicKey = process.env.REACT_APP_STELLAR_ISSUER_PUBLIC_KEY;
      const envSecretKey = process.env.REACT_APP_STELLAR_ISSUER_SECRET_KEY;
      
      if (envPublicKey && envSecretKey) {
        // Use credentials from environment variables
        setPublicKey(envPublicKey);
        localStorage.setItem('stellarPublicKey', envPublicKey);
        localStorage.setItem('stellarSecretKey', envSecretKey);
        setIsConnected(true);
        setError(null);
        
        // Check if the account exists
        try {
          await server.loadAccount(envPublicKey);
          console.log('Account exists and is funded');
        } catch (accountError) {
          console.error('Account not found, will be funded by user action in the UI');
        }
        
        return;
      }

      // If no .env key, show the connect modal
      setShowConnectModal(true);
    } catch (err) {
      setError(`Failed to connect wallet: ${err.message}`);
    }
  };

  // Handle manual public key connection
  const handleManualConnect = async () => {
    try {
      if (!inputPublicKey) {
        setError('Please enter a public key');
        return;
      }

      // Validate the public key format
      try {
        StellarSdk.StrKey.decodeEd25519PublicKey(inputPublicKey);
      } catch (e) {
        setError('Invalid Stellar public key format');
        return;
      }

      // Test if the account exists
      const account = await server.loadAccount(inputPublicKey);
      if (!account) {
        setError('Account not found on the Stellar network');
        return;
      }

      setPublicKey(inputPublicKey);
      setIsConnected(true);
      setError(null);
      localStorage.setItem('stellarPublicKey', inputPublicKey);
      setShowConnectModal(false);
    } catch (err) {
      setError(`Failed to connect wallet: ${err.message}`);
    }
  };

  // Disconnect from the Stellar wallet
  const disconnectWallet = async () => {
    try {
      localStorage.removeItem('stellarPublicKey');
      setPublicKey(null);
      setIsConnected(false);
      setError(null);
    } catch (err) {
      setError(`Failed to disconnect wallet: ${err.message}`);
    }
  };

  // Sign a transaction
  const signTransaction = async (transaction) => {
    try {
      if (!isConnected) {
        throw new Error('Wallet not connected');
      }
      
      const secretKey = process.env.REACT_APP_STELLAR_SECRET_KEY;
      if (!secretKey) {
        throw new Error('Secret key not found in environment variables');
      }
      
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      transaction.sign(keypair);
      
      return transaction;
    } catch (err) {
      setError(`Failed to sign transaction: ${err.message}`);
      throw err;
    }
  };

  // Get account details
  const getAccountDetails = async () => {
    try {
      if (!isConnected || !publicKey) {
        throw new Error('Wallet not connected');
      }
      
      return await server.loadAccount(publicKey);
    } catch (err) {
      setError(`Failed to get account details: ${err.message}`);
      throw err;
    }
  };

  // Value to be provided by the context
  const value = {
    publicKey,
    isConnected,
    error,
    connectWallet,
    disconnectWallet,
    signTransaction,
    getAccountDetails,
    server
  };

  return (
    <StellarWalletContext.Provider value={value}>
      {children}
      {showConnectModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Connect Stellar Wallet</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowConnectModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label htmlFor="publicKey" className="form-label">Stellar Public Key</label>
                  <input
                    type="text"
                    className="form-control"
                    id="publicKey"
                    value={inputPublicKey}
                    onChange={(e) => setInputPublicKey(e.target.value)}
                    placeholder="Enter your Stellar public key"
                  />
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowConnectModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleManualConnect}
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </StellarWalletContext.Provider>
  );
} 