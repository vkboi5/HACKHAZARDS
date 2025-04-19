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
      // Use the environment setting or default to testnet
      const networkUrl = process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org';
      console.log(`Initializing Stellar server with ${networkUrl}`);
      const stellarServer = new StellarSdk.Horizon.Server(networkUrl);
      setServer(stellarServer);
      
      // Check if we have a stored public key
      const storedPublicKey = localStorage.getItem('stellarPublicKey');
      if (storedPublicKey) {
        setPublicKey(storedPublicKey);
        setIsConnected(true);
        
        // Asynchronously validate the account status without blocking
        (async () => {
          let retryCount = 0;
          const maxRetries = 3;
          const retryDelay = 1000; // 1 second
          
          while (retryCount <= maxRetries) {
            try {
              await stellarServer.loadAccount(storedPublicKey);
              console.log('Stored account validated successfully');
              break; // Exit the loop if successful
            } catch (validationError) {
              if (retryCount === maxRetries) {
                console.warn('Stored account validation failed after retries:', validationError.message);
                // Don't disconnect or show errors here, just log the warning
              } else {
                console.warn(`Stored account validation attempt ${retryCount + 1} failed:`, validationError.message);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          }
        })();
      }
    } catch (err) {
      console.error('Initialization error:', err);
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
        // Validate the public key format
        try {
          StellarSdk.StrKey.decodeEd25519PublicKey(envPublicKey);
        } catch (e) {
          console.error('Invalid public key format in environment variables:', e);
          setError('Invalid Stellar public key format in environment variables');
          return;
        }
        
        // Use credentials from environment variables
        setPublicKey(envPublicKey);
        localStorage.setItem('stellarPublicKey', envPublicKey);
        localStorage.setItem('stellarSecretKey', envSecretKey);
        setIsConnected(true);
        setError(null);
        
        // Check if the account exists and is properly funded
        try {
          const account = await server.loadAccount(envPublicKey);
          console.log('Account exists and is funded');
          
          // Check if account has sufficient XLM balance
          const xlmBalance = account.balances.find(b => b.asset_type === 'native');
          if (xlmBalance && parseFloat(xlmBalance.balance) < 5) {
            console.warn(`Account has low XLM balance: ${xlmBalance.balance}`);
          }
        } catch (accountError) {
          console.error('Account validation error:', accountError);
          if (accountError.response && accountError.response.status === 404) {
            console.warn('Account not found on the network. It may need to be created and funded.');
          } else {
            console.error('Network error while validating account:', accountError.message);
          }
          // We still connect but warn the user
        }
        
        return;
      }

      // If no .env key, show the connect modal
      setShowConnectModal(true);
    } catch (err) {
      console.error('Connect wallet error:', err);
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

      // Test if the account exists with better error handling
      try {
        const account = await server.loadAccount(inputPublicKey);
        
        // Check if account has sufficient XLM balance
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        if (xlmBalance && parseFloat(xlmBalance.balance) < 5) {
          console.warn(`Account has low XLM balance: ${xlmBalance.balance}`);
          // Continue but show a warning to the user
          setError(`Warning: Your account has a low XLM balance (${xlmBalance.balance}). You may need at least 5 XLM to perform operations.`);
          // The error will be cleared after a successful connection below
        }
        
        setPublicKey(inputPublicKey);
        setIsConnected(true);
        setError(null); // Clear any previous errors
        localStorage.setItem('stellarPublicKey', inputPublicKey);
        setShowConnectModal(false);
      } catch (accountError) {
        console.error('Account validation error:', accountError);
        
        // Provide more specific error messages based on the error type
        if (accountError.response) {
          if (accountError.response.status === 404) {
            setError('Account not found on the Stellar network. You may need to create and fund this account first.');
          } else {
            setError(`Server error (${accountError.response.status}): ${accountError.response.statusText || 'Unknown error'}`);
          }
        } else if (accountError.message.includes('Network Error')) {
          setError('Network error. Please check your internet connection and try again.');
        } else {
          setError(`Failed to validate account: ${accountError.message}`);
        }
      }
    } catch (err) {
      console.error('Manual connect error:', err);
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
      
      // Validate the transaction before signing
      if (!transaction) {
        throw new Error('No transaction provided');
      }
      
      // Try to get the secret key from localStorage first (most secure approach would be a proper key manager)
      let secretKey = localStorage.getItem('stellarSecretKey');
      
      // If not in localStorage, fall back to env vars
      if (!secretKey) {
        secretKey = process.env.REACT_APP_STELLAR_ISSUER_SECRET_KEY;
        if (!secretKey) {
          throw new Error('Secret key not found in storage or environment variables');
        }
      }
      
      try {
        // Validate the secret key format
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        
        // Ensure the keypair's public key matches our connected public key
        if (keypair.publicKey() !== publicKey) {
          console.warn('Warning: The secret key does not match the connected public key');
        }
        
        // Validate transaction has operations
        if (!transaction.operations || transaction.operations.length === 0) {
          throw new Error('Transaction has no operations');
        }
        
        // Sign the transaction
        transaction.sign(keypair);
        return transaction;
      } catch (keyError) {
        console.error('Key validation error:', keyError);
        throw new Error('Invalid secret key format. Please check your credentials.');
      }
    } catch (err) {
      console.error('Transaction signing error:', err);
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
      
      // Implement retry logic
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 1000; // 1 second
      
      while (retryCount <= maxRetries) {
        try {
          const account = await server.loadAccount(publicKey);
          return account;
        } catch (accountError) {
          console.error(`Error loading account details (attempt ${retryCount + 1}/${maxRetries + 1}):`, accountError);
          
          const shouldRetry = !(
            accountError.response && 
            accountError.response.status === 404
          );
          
          // If it's the last retry or not a retryable error, throw
          if (retryCount === maxRetries || !shouldRetry) {
            // Provide specific error messages based on the error type
            if (accountError.response) {
              if (accountError.response.status === 404) {
                throw new Error('Account not found on the Stellar network. You may need to create and fund this account first.');
              } else if (accountError.response.status === 400) {
                throw new Error(`Bad Request (${accountError.response.status}): Please check that your account information is valid.`);
              } else {
                throw new Error(`Server error (${accountError.response.status}): ${accountError.response.statusText || 'Unknown error'}`);
              }
            } else if (accountError.message.includes('Network Error')) {
              throw new Error('Network error. Please check your internet connection and try again.');
            } else {
              throw accountError;
            }
          }
          
          // Exponential backoff
          const delay = retryDelay * Math.pow(2, retryCount);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
        }
      }
    } catch (err) {
      const errorMessage = `Failed to get account details: ${err.message}`;
      console.error(errorMessage);
      setError(errorMessage);
      throw err;
    }
  };
  
  // Helper function to check if account is properly funded
  const checkAccountFunding = async (publicKey) => {
    try {
      const account = await server.loadAccount(publicKey);
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      if (!xlmBalance || parseFloat(xlmBalance.balance) < 5) {
        return {
          funded: false,
          balance: xlmBalance ? parseFloat(xlmBalance.balance) : 0,
          message: `Account has insufficient XLM (${xlmBalance ? xlmBalance.balance : 0} XLM). Consider adding more funds.`
        };
      }
      return { funded: true, balance: parseFloat(xlmBalance.balance) };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return { funded: false, balance: 0, message: 'Account not found on the Stellar network.' };
      }
      throw error;
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
    checkAccountFunding,
    server,
    showConnectModal,
    setShowConnectModal,
    inputPublicKey,
    setInputPublicKey
  };

  // Error boundary for handling React errors
  const [modalError, setModalError] = useState(null);

  // Reset modal error when modal visibility changes
  useEffect(() => {
    if (!showConnectModal) {
      setModalError(null);
    }
  }, [showConnectModal]);

  // Handle modal errors
  const handleModalError = (error) => {
    console.error('Modal error:', error);
    setModalError(`An error occurred: ${error.message}`);
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
                {modalError && <div className="alert alert-danger">{modalError}</div>}
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