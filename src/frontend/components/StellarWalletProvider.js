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
      console.log('Starting signTransactionWithFreighter with XDR:', xdr.substring(0, 30) + '...');
      
      // Check if Freighter is installed
      const isInstalled = await isFreighterInstalled();
      console.log('Freighter installed check:', isInstalled);
      if (!isInstalled) {
        throw new Error('Freighter is not installed. Please install the Freighter browser extension first.');
      }
      
      // Check if Freighter is available and connected
      const isAvailable = await isFreighterAvailable();
      console.log('Freighter available check:', isAvailable);
      if (!isAvailable) {
        throw new Error('Freighter is not available or not connected. Please make sure Freighter is unlocked and connected.');
      }
      
      console.log('Requesting transaction signing from Freighter...');
      
      // Get network information to pass to the signTransaction function
      let networkDetails;
      try {
        networkDetails = await freighterApi.getNetworkDetails();
        console.log('Network details from Freighter:', networkDetails);
        
        if (!networkDetails || !networkDetails.networkPassphrase) {
          console.warn('Incomplete network details from Freighter:', networkDetails);
          // Use default testnet values if not provided
          networkDetails = {
            network: 'TESTNET',
            networkPassphrase: 'Test SDF Network ; September 2015'
          };
        }
      } catch (networkError) {
        console.error('Error getting network details from Freighter:', networkError);
        // Fallback to defaults
        networkDetails = {
          network: 'TESTNET',
          networkPassphrase: 'Test SDF Network ; September 2015'
        };
      }
      
      // Request signature from Freighter with timeout
      let signResult;
      try {
        console.log('Preparing to sign transaction with network:', networkDetails.network);
        
        // Add a timeout promise to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Freighter signing request timed out')), 30000);
        });
        
        // Race between the signing request and timeout
        signResult = await Promise.race([
          freighterApi.signTransaction(xdr, {
            network: networkDetails.network,
            networkPassphrase: networkDetails.networkPassphrase
          }),
          timeoutPromise
        ]);
        
        console.log('Raw sign result from Freighter:', signResult);
        console.log('Sign result type:', typeof signResult);
        console.log('Sign result keys:', Object.keys(signResult || {}));
      } catch (signError) {
        console.error('Error during Freighter signing:', signError);
        console.error('Sign error stack:', signError.stack);
        
        // Handle specific error cases
        if (signError.message && signError.message.toLowerCase().includes('cancel')) {
          throw new Error('Transaction signing was cancelled by the user');
        } else if (signError.message && signError.message.toLowerCase().includes('timeout')) {
          throw new Error('Transaction signing request timed out. Please try again.');
        } else {
          throw new Error(`Error during Freighter signing request: ${signError.message || 'Unknown error'}`);
        }
      }
      
      // Handle case when signResult is null or undefined
      if (!signResult) {
        console.error('No sign result received from Freighter');
        throw new Error('No response received from Freighter wallet. The request may have been cancelled or timed out.');
      }
      
      // Check for explicit error in the result
      if (signResult.error) {
        console.error('Freighter returned error:', signResult.error);
        const errorMsg = signResult.error;
        if (errorMsg.toLowerCase().includes('reject') || 
            errorMsg.toLowerCase().includes('cancel') || 
            errorMsg.toLowerCase().includes('denied')) {
          throw new Error('Transaction signing was rejected by the user');
        }
        throw new Error(`Freighter error: ${errorMsg}`);
      }
      
      // Try to extract the signed XDR from various possible property names
      const signedXDR = signResult.signedTxXdr || 
                        signResult.signedXDR || 
                        signResult.xdr || 
                        (signResult.result && (signResult.result.signedXDR || signResult.result.xdr)) ||
                        (typeof signResult === 'string' ? signResult : null);
      
      console.log('Extracted signed XDR:', signedXDR ? signedXDR.substring(0, 30) + '...' : 'null');
      
      // Validate that we received a signed XDR
      if (!signedXDR) {
        console.error('No signed XDR found in Freighter response:', signResult);
        console.error('Response type:', typeof signResult);
        console.error('Response keys:', Object.keys(signResult));
        
        // Check if this looks like a user cancellation
        if (signResult.status === 'rejected' || 
            (signResult.message && signResult.message.toLowerCase().includes('cancel'))) {
          throw new Error('Transaction signing was cancelled by the user');
        }
        
        // Try to get more information about the failure
        if (signResult.message) {
          throw new Error(`Freighter signing failed: ${signResult.message}`);
        }
        
        throw new Error('No signed XDR returned from Freighter. Please try again or check Freighter wallet status.');
      }
      
      // Validate that the signed XDR is a valid string
      if (typeof signedXDR !== 'string' || signedXDR.trim() === '') {
        console.error('Invalid signed XDR format:', typeof signedXDR);
        throw new Error(`Invalid signed XDR format received: ${typeof signedXDR}`);
      }
      
      // Validate that the XDR can be parsed
      try {
        console.log('Attempting to parse signed XDR...');
        const parsedTx = StellarSdk.xdr.TransactionEnvelope.fromXDR(signedXDR, 'base64');
        const signatures = parsedTx.v1().signatures();
        if (signatures.length === 0) {
          console.warn('Transaction was returned from Freighter but has no signatures');
          throw new Error('Transaction was returned but has no signatures');
        }
        console.log(`Transaction signed successfully with ${signatures.length} signature(s)`);
      } catch (parseError) {
        console.error('Error parsing signed XDR:', parseError);
        console.error('Parse error stack:', parseError.stack);
        throw new Error(`Invalid transaction format returned from Freighter: ${parseError.message}`);
      }
      
      console.log('Transaction signed successfully');
      console.log('Signed XDR (first 30 chars):', signedXDR.substring(0, 30) + '...');
      
      return signedXDR;
    } catch (err) {
      console.error('Error signing transaction with Freighter:', err);
      console.error('Error stack:', err.stack);
      
      // Provide user-friendly errors based on error type
      let userError = err.message;
      
      if (err.message.includes('cancel') || err.message.includes('reject')) {
        userError = 'Transaction signing was cancelled. Please try again when you are ready to sign.';
      } else if (err.message.includes('Network Error') || err.message.includes('timed out')) {
        userError = 'Network error while communicating with Freighter wallet. Please check your connection and try again.';
      } else if (err.message.includes('not installed') || err.message.includes('not available')) {
        userError = 'Freighter wallet extension is not properly installed or activated. Please check your browser extensions.';
      }
      
      setError(`Failed to sign transaction: ${userError}`);
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
    console.log('Original transaction XDR (first 30 chars):', xdr.substring(0, 30) + '...');
    
    try {
      let signedXdr;
      
      if (walletMethod === 'freighter') {
        signedXdr = await signTransactionWithFreighter(xdr);
      } else if (walletMethod === 'manual') {
        throw new Error('Manual wallet mode does not support transaction signing. Please use Freighter for transactions.');
      } else {
        throw new Error('Unknown wallet method');
      }
      
      // Ensure we're returning a string, not an object
      if (typeof signedXdr === 'object' && signedXdr !== null) {
        console.log('Received object instead of string, looking for XDR property', signedXdr);
        signedXdr = signedXdr.xdr || signedXdr.signedXDR || signedXdr.signedTxXDR;
        
        if (!signedXdr) {
          throw new Error('Could not find XDR in response object');
        }
      }
      
      if (typeof signedXdr !== 'string') {
        throw new Error(`Expected string XDR but got ${typeof signedXdr}`);
      }
      
      console.log('Final signTransaction result type:', typeof signedXdr);
      return signedXdr;
    } catch (error) {
      console.error('Error in signTransaction:', error);
      throw error;
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