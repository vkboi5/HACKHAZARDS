import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as freighterApi from '@stellar/freighter-api';
import './StellarWalletProvider.css';

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
  const [walletMethod, setWalletMethod] = useState(''); // 'freighter', 'manual', etc.
  const [balanceInXLM, setBalanceInXLM] = useState(0);
  
  // Initialize the Stellar server
  useEffect(() => {
    try {
      // Use the environment setting or default to testnet
      const networkUrl = process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org';
      console.log(`Initializing Stellar server with ${networkUrl}`);
      const stellarServer = new StellarSdk.Horizon.Server(networkUrl);
      setServer(stellarServer);
      
      // Check for Freighter on initial load
      console.log("Checking for Freighter on page load");
      isFreighterInstalled().then(isInstalled => {
        console.log("Freighter installed:", isInstalled);
      });
      
      // Check if we have a stored wallet connection
      const storedPublicKey = localStorage.getItem('stellarPublicKey');
      const storedWalletMethod = localStorage.getItem('stellarWalletMethod');
      
      if (storedPublicKey && storedWalletMethod) {
        setPublicKey(storedPublicKey);
        setWalletMethod(storedWalletMethod);
        setIsConnected(true);
        
        // Load account balance
        loadAccountBalance(storedPublicKey, stellarServer);
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setError(`Failed to initialize Stellar server: ${err.message}`);
    }
  }, []);
  
  // Load account balance
  const loadAccountBalance = async (address, serverInstance) => {
    try {
      const account = await serverInstance.loadAccount(address);
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      if (xlmBalance) {
        setBalanceInXLM(parseFloat(xlmBalance.balance));
      }
    } catch (error) {
      console.error("Failed to load account balance:", error);
    }
  };

  // Connect to a Stellar wallet
  const connectWallet = async () => {
    try {
      // Show the connect modal with options
      setShowConnectModal(true);
    } catch (err) {
      console.error('Connect wallet error:', err);
      setError(`Failed to connect wallet: ${err.message}`);
    }
  };
  
  // Check if Freighter is installed
  const isFreighterInstalled = async () => {
    console.log("Checking for Freighter installation...");
    try {
      const result = await freighterApi.isConnected();
      console.log("Freighter API isConnected result:", result);
      return result.isConnected;
    } catch (e) {
      console.warn('Error checking Freighter installation:', e);
      return false;
    }
  };

  // Check if Freighter is available and connected
  const isFreighterAvailable = async () => {
    try {
      console.log("Checking if Freighter is connected...");
      
      // First check if connected
      const checkConnected = await freighterApi.isConnected();
      
      // Then check if app is allowed
      let isAllowed = false;
      if (checkConnected.isConnected) {
        try {
          const allowedCheck = await freighterApi.isAllowed();
          isAllowed = allowedCheck.isAllowed;
        } catch (e) {
          console.warn("Error checking if app is allowed:", e);
        }
      }
      
      console.log("Freighter connected:", checkConnected.isConnected, "allowed:", isAllowed);
      return checkConnected.isConnected && isAllowed;
    } catch (e) {
      console.warn('Error checking Freighter availability:', e);
      return false;
    }
  };

  // Connect using Freighter
  const connectWithFreighter = async () => {
    try {
      const isInstalled = await isFreighterInstalled();
      if (!isInstalled) {
        throw new Error('Freighter is not installed. Please install the Freighter browser extension and reload the page.');
      }
      
      // Request public key from Freighter
      let retrievedPublicKey;
      try {
        console.log("Attempting to get public key from Freighter...");
        
        // First try to request access which will prompt the user if needed
        const accessResult = await freighterApi.requestAccess();
        
        if (accessResult.error) {
          console.error("Error requesting access:", accessResult.error);
          throw new Error(accessResult.error);
        }
        
        // If we have access, get the public key
        const addressResult = await freighterApi.getAddress();
        
        if (addressResult.error) {
          console.error("Error getting address:", addressResult.error);
          throw new Error(addressResult.error);
        }
        
        retrievedPublicKey = addressResult.address;
        
        console.log("Retrieved public key from Freighter:", 
          retrievedPublicKey ? retrievedPublicKey.substring(0, 5) + '...' + retrievedPublicKey.substring(retrievedPublicKey.length - 5) : 'null');
      } catch (freighterError) {
        console.error("Error getting public key from Freighter:", freighterError);
        setError(`Freighter error: ${freighterError.message || 'Could not get public key'}`);
        return;
      }
      
      if (!retrievedPublicKey) {
        setError('No public key received from Freighter. Please make sure you have created an account in Freighter and that the wallet is unlocked.');
        return;
      }
      
      // Validate the public key format
      try {
        StellarSdk.StrKey.decodeEd25519PublicKey(retrievedPublicKey);
      } catch (e) {
        console.error("Invalid public key format:", e);
        setError('Invalid Stellar public key format received from Freighter');
        return;
      }
      
      // Check if the account exists
      try {
        const account = await server.loadAccount(retrievedPublicKey);
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        if (xlmBalance) {
          setBalanceInXLM(parseFloat(xlmBalance.balance));
        }
      } catch (accountError) {
        console.error('Account validation error:', accountError);
        if (accountError.response && accountError.response.status === 404) {
          setError('Account not found on the Stellar network. You may need to create and fund this account first.');
          return;
        }
      }
      
      // Set the public key and connected state
      setPublicKey(retrievedPublicKey);
      setIsConnected(true);
      setWalletMethod('freighter');
      setError(null);
      
      // Store the public key and wallet method in localStorage
      localStorage.setItem('stellarPublicKey', retrievedPublicKey);
      localStorage.setItem('stellarWalletMethod', 'freighter');
      
      // Close the modal
      setShowConnectModal(false);
    } catch (err) {
      console.error('Freighter connect error:', err);
      setError(`Failed to connect Freighter: ${err.message}`);
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
        if (xlmBalance) {
          setBalanceInXLM(parseFloat(xlmBalance.balance));
          
          if (parseFloat(xlmBalance.balance) < 5) {
            console.warn(`Account has low XLM balance: ${xlmBalance.balance}`);
            // Continue but show a warning to the user
            setError(`Warning: Your account has a low XLM balance (${xlmBalance.balance}). You may need at least 5 XLM to perform operations.`);
            // The error will be cleared after a successful connection below
          }
        }
        
        setPublicKey(inputPublicKey);
        setIsConnected(true);
        setWalletMethod('manual');
        setError(null); // Clear any previous errors
        
        // Store the connection details
        localStorage.setItem('stellarPublicKey', inputPublicKey);
        localStorage.setItem('stellarWalletMethod', 'manual');
        
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
  const disconnectWallet = () => {
    setPublicKey(null);
    setIsConnected(false);
    setWalletMethod('');
    localStorage.removeItem('stellarPublicKey');
    localStorage.removeItem('stellarWalletMethod');
    setBalanceInXLM(0);
  };

  // Sign transaction using Freighter
  const signTransactionWithFreighter = async (xdr) => {
    try {
      const isInstalled = await isFreighterInstalled();
      if (!isInstalled) {
        throw new Error('Freighter is not installed');
      }
      
      console.log('Requesting transaction signing from Freighter...');
      
      // Get network information to pass to the signTransaction function
      const networkDetails = await freighterApi.getNetworkDetails();
      
      const signResult = await freighterApi.signTransaction(xdr, {
        network: networkDetails.network,
        networkPassphrase: networkDetails.networkPassphrase
      });
      
      if (signResult.error) {
        throw new Error(signResult.error);
      }
      
      console.log('Transaction signed successfully');
      return signResult.signedXDR || signResult.signedTxXDR;
    } catch (err) {
      console.error('Error signing transaction with Freighter:', err);
      setError(`Failed to sign transaction: ${err.message}`);
      throw err;
    }
  };
  
  // Get account details
  const getAccountDetails = async (accountAddress) => {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const account = await server.loadAccount(accountAddress || publicKey);
        return account;
      } catch (error) {
        console.error(`Attempt ${retryCount + 1}/${maxRetries} - Error loading account:`, error);
        if (retryCount === maxRetries - 1) {
          throw error;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        retryCount++;
      }
    }
  };
  
  // Sign a transaction based on wallet method
  const signTransaction = async (transaction) => {
    if (!isConnected) {
      throw new Error('Wallet is not connected');
    }
    
    // Convert the transaction object to XDR
    const xdr = transaction.toXDR();
    
    if (walletMethod === 'freighter') {
      return await signTransactionWithFreighter(xdr);
    } else if (walletMethod === 'manual') {
      throw new Error('Manual wallet mode does not support transaction signing. Please use Freighter for transactions.');
    } else {
      throw new Error('Unknown wallet method');
    }
  };
  
  // Check if an account is funded
  const checkAccountFunding = async (address) => {
    try {
      await server.loadAccount(address);
      return { funded: true, message: 'Account is funded' };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return { 
          funded: false, 
          message: 'This account does not exist on the Stellar network. Please fund it first.' 
        };
      }
      return { 
        funded: false, 
        message: `Error checking account: ${error.message}` 
      };
    }
  };

  // Value to be provided by the context
  const value = {
    publicKey,
    isConnected,
    error,
    connectWallet,
    disconnectWallet,
    connectWithFreighter,
    signTransaction,
    getAccountDetails,
    showConnectModal,
    setShowConnectModal,
    inputPublicKey,
    setInputPublicKey,
    handleManualConnect,
    walletMethod,
    balanceInXLM,
    isFreighterInstalled,
    checkAccountFunding
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
      
      {/* Wallet Connect Modal */}
      {showConnectModal && (
        <div className="modal-backdrop">
          <div className="wallet-connect-modal">
            <div className="modal-header">
              <h3>Connect Wallet</h3>
              <button 
                className="close-button"
                onClick={() => setShowConnectModal(false)}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              {error && <div className="error-message">{error}</div>}
              
              <div className="wallet-options">
                <button
                  className={`wallet-option ${isFreighterInstalled ? '' : 'disabled'}`}
                  onClick={connectWithFreighter}
                  disabled={!isFreighterInstalled}
                >
                  <div className="wallet-icon">
                    <img 
                      src="/images/freighter-logo.svg" 
                      alt="Freighter" 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/40?text=F';
                      }}
                    />
                  </div>
                  <div className="wallet-info">
                    <h4>Freighter</h4>
                    <p>Connect using the Freighter browser extension</p>
                  </div>
                </button>
                
                {!isFreighterInstalled && (
                  <div className="wallet-install-note">
                    <p>
                      Freighter not installed. 
                      <a 
                        href="https://www.freighter.app/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        Install Freighter
                      </a>
                    </p>
                  </div>
                )}
                
                <div className="divider">
                  <span>OR</span>
                </div>
                
                <div className="manual-entry">
                  <h4>Enter Public Key Manually</h4>
                  <p>Enter your Stellar public key (read-only mode)</p>
                  <input
                    type="text"
                    placeholder="G... or your Stellar address"
                    value={inputPublicKey}
                    onChange={(e) => setInputPublicKey(e.target.value)}
                  />
                  <button
                    className="connect-button"
                    onClick={handleManualConnect}
                  >
                    Connect
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </StellarWalletContext.Provider>
  );
} 