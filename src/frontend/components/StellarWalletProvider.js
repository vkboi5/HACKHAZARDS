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

// Helper function to validate transaction before submission
const validateTransaction = async (xdr) => {
  try {
    // If StellarSDK is available, try to validate and fix common issues
    if (typeof window !== 'undefined' && (window.StellarSdk || await import('@stellar/stellar-sdk'))) {
      const StellarSdk = window.StellarSdk || (await import('@stellar/stellar-sdk')).default;
      const networkPassphrase = process.env.REACT_APP_STELLAR_NETWORK === 'PUBLIC'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET;
        
      const tx = new StellarSdk.Transaction(xdr, networkPassphrase);
      
      // Check sequence number
      console.log(`Transaction sequence: ${tx.sequence}`);
      
      // Check fee
      console.log(`Transaction fee: ${tx.fee} stroops for ${tx.operations.length} operations`);
      const recommendedFee = Math.max(100 * tx.operations.length, 100);
      if (parseInt(tx.fee) < recommendedFee) {
        console.warn(`Warning: Transaction fee (${tx.fee}) might be too low. Recommended: ${recommendedFee}`);
      }
      
      // Check time bounds
      if (tx.timeBounds) {
        const now = Math.floor(Date.now() / 1000);
        if (tx.timeBounds.maxTime && tx.timeBounds.maxTime < now) {
          console.warn(`Transaction has expired at ${new Date(tx.timeBounds.maxTime * 1000).toISOString()}`);
          return { valid: false, error: 'Transaction has expired' };
        }
      }
      
      return { valid: true, tx };
    }
  } catch (error) {
    console.warn('Transaction validation error:', error);
  }
  
  return { valid: true }; // Default to valid if we couldn't validate
};

// Helper function for fallback signing with freighterApi
const handleFallbackSigning = async (xdr) => {
  console.log('Falling back to freighterApi.signTransaction directly');
  
  // Get network info for signing
  const networkDetails = await freighterApi.getNetworkDetails().catch(() => ({
    network: process.env.REACT_APP_STELLAR_NETWORK || 'TESTNET',
    networkPassphrase: process.env.REACT_APP_STELLAR_NETWORK === 'PUBLIC' 
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015'
  }));
  
  const signResult = await freighterApi.signTransaction(xdr, {
    network: networkDetails.network,
    networkPassphrase: networkDetails.networkPassphrase
  });
  
  console.log('Fallback signing result type:', typeof signResult);
  
  // Enhanced debugging of result structure
  if (signResult && typeof signResult === 'object') {
    console.log('Fallback object keys:', Object.keys(signResult));
    // Log properties for debugging
    Object.entries(signResult).forEach(([key, value]) => {
      const valueType = typeof value;
      const displayValue = valueType === 'string' 
        ? (value.length > 20 ? `${value.substring(0, 20)}...` : value)
        : valueType === 'object' ? 'Object' : value;
      console.log(`Fallback property: ${key} (${valueType})`, displayValue);
    });
  }
  
  if (typeof signResult === 'string') {
    console.log('Using string response from fallback');
    return signResult;
  } else if (signResult && typeof signResult === 'object') {
    if (signResult.signedXDR && typeof signResult.signedXDR === 'string') {
      console.log('Using signedXDR property from fallback response');
      return signResult.signedXDR;
    } else if (signResult.xdr && typeof signResult.xdr === 'string') {
      console.log('Using xdr property from fallback response');
      return signResult.xdr;
    } else if (signResult.signed_xdr && typeof signResult.signed_xdr === 'string') {
      console.log('Using signed_xdr property from fallback response');
      return signResult.signed_xdr;
    } else if (signResult.transaction && typeof signResult.transaction === 'string') {
      console.log('Using transaction property from fallback response');
      return signResult.transaction;
    }
    
    // Look for any property that contains "xdr" in its name
    const xdrProps = Object.entries(signResult)
      .filter(([key, value]) => 
        typeof value === 'string' && 
        value.length > 0 && 
        key.toLowerCase().includes('xdr')
      );
    
    if (xdrProps.length > 0) {
      console.log(`Using found property "${xdrProps[0][0]}" containing "xdr" in name from fallback`);
      return xdrProps[0][1];
    }
    
    // Check for any string property that looks like a base64 XDR
    const possibleXdrProps = Object.entries(signResult)
      .filter(([_, value]) => 
        typeof value === 'string' && 
        value.length > 32 &&
        /^[A-Za-z0-9+/=]+$/.test(value) // Base64 regex pattern
      );
    
    if (possibleXdrProps.length > 0) {
      console.log(`Using string property "${possibleXdrProps[0][0]}" with base64 encoded content from fallback`);
      return possibleXdrProps[0][1];
    }
  }
  
  console.warn('Unrecognized result from fallback freighterApi.signTransaction:', 
    typeof signResult, 
    signResult ? (typeof signResult === 'object' ? Object.keys(signResult) : signResult) : 'null'
  );
  throw new Error('Unrecognized result from freighterApi.signTransaction');
};

export function StellarWalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [server, setServer] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [inputPublicKey, setInputPublicKey] = useState('');
  const [walletMethod, setWalletMethod] = useState(''); // 'freighter', 'manual', etc.
  const [balanceInXLM, setBalanceInXLM] = useState(0);
  const [walletStatus, setWalletStatus] = useState('CONNECTED');
  
  // Initialize the Stellar server
  useEffect(() => {
    try {
      // Use the environment setting or default to testnet
      const networkUrl = process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org';
      console.log(`Initializing Stellar server with ${networkUrl}`);
      const stellarServer = new StellarSdk.Horizon.Server(networkUrl);
      setServer(stellarServer);
      
      // Check for Freighter on initial load with delay
      // Browser extensions might not be immediately available
      console.log("Checking for Freighter on page load (with delay)");
      
      // Wait a moment to allow browser extensions to initialize
      setTimeout(async () => {
        try {
          // First check if Freighter is installed
          const isInstalled = await isFreighterInstalled();
          console.log("Freighter installed:", isInstalled);
          
          if (isInstalled) {
            // Check if we have a stored wallet connection
            const storedPublicKey = localStorage.getItem('stellarPublicKey');
            const storedWalletMethod = localStorage.getItem('stellarWalletMethod');
            
            if (storedPublicKey && storedWalletMethod === 'freighter') {
              console.log("Found stored Freighter connection, verifying...");
              
              // Verify Freighter is still connected and available
              const isAvailable = await isFreighterAvailable();
              
              if (isAvailable) {
                console.log("Freighter is available, restoring connection");
                setPublicKey(storedPublicKey);
                setWalletMethod(storedWalletMethod);
                setIsConnected(true);
                
                // Load account balance
                loadAccountBalance(storedPublicKey, stellarServer);
              } else {
                console.log("Freighter is not available, clearing stored connection");
                localStorage.removeItem('stellarPublicKey');
                localStorage.removeItem('stellarWalletMethod');
              }
            } else if (storedPublicKey && storedWalletMethod === 'manual') {
              // For manual wallet, just restore the connection
              console.log("Restoring manual wallet connection");
              setPublicKey(storedPublicKey);
              setWalletMethod(storedWalletMethod);
              setIsConnected(true);
              
              // Load account balance
              loadAccountBalance(storedPublicKey, stellarServer);
            }
          } else {
            console.log("Freighter not installed, checking for manual wallet connection");
            
            // If Freighter is not installed, check for manual connection
            const storedPublicKey = localStorage.getItem('stellarPublicKey');
            const storedWalletMethod = localStorage.getItem('stellarWalletMethod');
            
            if (storedPublicKey && storedWalletMethod === 'manual') {
              console.log("Restoring manual wallet connection");
              setPublicKey(storedPublicKey);
              setWalletMethod(storedWalletMethod);
              setIsConnected(true);
              
              // Load account balance
              loadAccountBalance(storedPublicKey, stellarServer);
            }
          }
        } catch (checkError) {
          console.error("Error checking Freighter on load:", checkError);
        }
      }, 1000); // Wait 1 second for extensions to initialize
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
    
    // Try multiple detection methods with a short timeout
    return new Promise(async (resolve) => {
      let detected = false;
      
      // Set a timeout to ensure we don't hang waiting for Freighter
      const timeoutId = setTimeout(() => {
        if (!detected) {
          console.warn('Freighter detection timed out');
          resolve(false);
        }
      }, 2000);
      
      // Method 1: Check window.freighter directly (most reliable when available)
      if (typeof window !== 'undefined' && window.freighter) {
        try {
          const isConnected = await window.freighter.isConnected();
          console.log("window.freighter isConnected result:", isConnected);
          detected = true;
          clearTimeout(timeoutId);
          resolve(true);
          return;
        } catch (e) {
          console.warn('Error checking window.freighter:', e);
          // Continue to other methods
        }
      }
      
      // Method 2: Use freighterApi.isConnected
      try {
        const result = await freighterApi.isConnected();
        console.log("Freighter API isConnected result:", result);
        if (result && (result.isConnected || result === true)) {
          detected = true;
          clearTimeout(timeoutId);
          resolve(true);
          return;
        }
      } catch (e) {
        console.warn('Error checking Freighter API:', e);
        // Continue to next method
      }
      
      // Method 3: Check if freighterApi methods exist
      if (freighterApi && typeof freighterApi.getPublicKey === 'function') {
        console.log("Freighter API methods exist");
        detected = true;
        clearTimeout(timeoutId);
        resolve(true);
        return;
      }
      
      // Method 4: Last resort - check for window events or DOM elements
      // This is less reliable but might catch some cases
      if (typeof window !== 'undefined') {
        if (window.freighterApi || 
            document.querySelector('[data-extension-id="freighter"]') ||
            document.querySelector('#freighter-extension')) {
          console.log("Detected Freighter via DOM or window properties");
          detected = true;
          clearTimeout(timeoutId);
          resolve(true);
          return;
        }
      }
      
      // If we get here without detecting Freighter, wait for the timeout
      console.log("Could not detect Freighter through standard methods");
      if (!detected) {
        // Don't resolve here - let the timeout handle it
        // to give asynchronous extension loading a chance
      }
    });
  };

  // Check if Freighter is available and connected
  const isFreighterAvailable = async () => {
    try {
      console.log("Checking if Freighter is available and connected...");
      
      // First, check if Freighter is installed
      const isInstalled = await isFreighterInstalled();
      if (!isInstalled) {
        console.log("Freighter is not installed or not detected");
        return false;
      }
      
      // Now check if it's unlocked and ready
      let isUnlocked = false;
      let isAllowedToUse = false;
      
      // Try direct window.freighter first if available
      if (typeof window !== 'undefined' && window.freighter) {
        try {
          const isConnected = await window.freighter.isConnected();
          if (isConnected) {
            console.log("window.freighter reports connected/unlocked");
            isUnlocked = true;
          }
        } catch (e) {
          console.warn("Error with window.freighter connection check:", e);
          // Fall back to API
        }
      }
      
      // If we couldn't confirm with direct access, try the API
      if (!isUnlocked) {
        try {
          const checkConnected = await freighterApi.isConnected();
          if (checkConnected && checkConnected.isConnected) {
            console.log("freighterApi reports connected/unlocked");
            isUnlocked = true;
          }
        } catch (e) {
          console.warn("Error checking if Freighter is connected via API:", e);
          return false;
        }
      }
      
      // If not unlocked, we can't proceed
      if (!isUnlocked) {
        console.log("Freighter is installed but not unlocked");
        return false;
      }
      
      // Check if the app is allowed to access Freighter
      try {
        const allowedCheck = await freighterApi.isAllowed();
        isAllowedToUse = allowedCheck && allowedCheck.isAllowed;
        console.log("App is allowed to use Freighter:", isAllowedToUse);
      } catch (e) {
        console.warn("Error checking if app is allowed to use Freighter:", e);
        // Unable to confirm permission, assume not allowed
        isAllowedToUse = false;
      }
      
      // Final result: must be installed, unlocked and allowed
      const isAvailable = isInstalled && isUnlocked && isAllowedToUse;
      console.log(`Freighter availability: installed=${isInstalled}, unlocked=${isUnlocked}, allowed=${isAllowedToUse}`);
      return isAvailable;
    } catch (e) {
      console.warn('Error checking Freighter availability:', e);
      return false;
    }
  };

  // Connect using Freighter
  const connectWithFreighter = async () => {
    try {
      console.log('Attempting to connect with Freighter...');
      
      // Check if Freighter is installed with improved detection
      let freighterDetected = false;
      let retryCount = 0;

      while (!freighterDetected && retryCount < 3) {
        console.log(`Checking for Freighter (attempt ${retryCount + 1})...`);
        
        if (typeof window !== 'undefined' && window.freighter) {
          freighterDetected = true;
          console.log('Freighter detected via window.freighter');
        } else {
          // Try accessing the freighter object through alternative methods
          try {
            // Check if freighterApi is working even if direct window.freighter isn't
            const freighterConnected = await freighterApi.isConnected();
            if (freighterConnected) {
              freighterDetected = true;
              console.log('Freighter detected via freighterApi.isConnected()');
            }
          } catch (checkError) {
            console.warn('Error checking Freighter via API:', checkError);
          }
          
          if (!freighterDetected) {
            retryCount++;
            // Short delay before checking again
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      // After retries, check final status
      if (!freighterDetected) {
        console.error('Freighter extension not detected after multiple attempts');
        throw new Error('Freighter is not installed or not accessible. Please install the Freighter browser extension, refresh the page, and try again.');
      }
      
      // Request public key from Freighter
      let retrievedPublicKey;
      try {
        console.log("Attempting to get public key from Freighter...");
        
        // First try direct window.freighter access if available
        if (window.freighter) {
          try {
            console.log("Trying window.freighter direct access");
            // Try to get permission first if needed
            try {
              const isConnected = await window.freighter.isConnected();
              console.log("Freighter connected status:", isConnected);
              
              if (!isConnected) {
                // If not connected, try to request permission (this may open the Freighter popup)
                console.log("Freighter not connected, will try to request permission");
              }
            } catch (connectionError) {
              console.warn("Error checking Freighter connection:", connectionError);
            }
            
            // Now try to get the public key
            retrievedPublicKey = await window.freighter.getPublicKey();
            console.log("Retrieved public key using window.freighter:", 
              retrievedPublicKey ? retrievedPublicKey.substring(0, 5) + '...' + retrievedPublicKey.substring(retrievedPublicKey.length - 5) : 'null');
            
            if (retrievedPublicKey) {
              // Successfully retrieved public key
              console.log("Successfully retrieved public key using window.freighter");
            } else {
              throw new Error("No public key returned from window.freighter");
            }
          } catch (directError) {
            console.warn("Error using window.freighter direct access:", directError);
            // Fall back to freighterApi
          }
        }
        
        // If direct access didn't work, try freighterApi
        if (!retrievedPublicKey) {
          console.log("Trying freighterApi for public key");
          
          // First make sure we have permission
          try {
            const allowedStatus = await freighterApi.isAllowed();
            if (!allowedStatus.isAllowed) {
              console.log("App not allowed, requesting access...");
              // Request permission which will prompt the user
              const accessResult = await freighterApi.requestAccess();
              
              if (accessResult.error) {
                console.error("Error requesting access:", accessResult.error);
                throw new Error(accessResult.error);
              }
            } else {
              console.log("App already has permission");
            }
          } catch (permissionError) {
            console.warn("Error checking permission:", permissionError);
            // Continue anyway and try to get the address
          }
          
          // Now try to get the address
          try {
            const addressResult = await freighterApi.getAddress();
            
            if (addressResult.error) {
              console.error("Error getting address:", addressResult.error);
              throw new Error(addressResult.error);
            }
            
            retrievedPublicKey = addressResult.address;
            
            console.log("Retrieved public key from freighterApi:", 
              retrievedPublicKey ? retrievedPublicKey.substring(0, 5) + '...' + retrievedPublicKey.substring(retrievedPublicKey.length - 5) : 'null');
          } catch (addressError) {
            console.error("Error getting address:", addressError);
            throw addressError;
          }
        }
      } catch (freighterError) {
        console.error("Error getting public key from Freighter:", freighterError);
        
        // Provide more helpful error messages
        if (freighterError.message && freighterError.message.toLowerCase().includes('not connected')) {
          setError('Your Freighter wallet is locked. Please unlock it and try again.');
        } else if (freighterError.message && freighterError.message.toLowerCase().includes('user rejected')) {
          setError('You rejected the connection request. Please try again and approve the connection.');
        } else if (freighterError.message && freighterError.message.toLowerCase().includes('permission')) {
          setError('Permission denied. Please grant permission to this application in your Freighter wallet.');
        } else {
          setError(`Freighter error: ${freighterError.message || 'Could not get public key'}`);
        }
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
        console.log(`Checking if account ${retrievedPublicKey.substring(0, 5)}... exists on the network`);
        const account = await server.loadAccount(retrievedPublicKey);
        console.log("Account exists on the network");
        
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        if (xlmBalance) {
          setBalanceInXLM(parseFloat(xlmBalance.balance));
          console.log(`Account has ${xlmBalance.balance} XLM`);
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
      
      console.log("Successfully connected to Freighter wallet!");
      return true;
    } catch (err) {
      console.error('Freighter connect error:', err);
      setError(`Failed to connect Freighter: ${err.message}`);
      return false;
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
    try {
      setPublicKey(null);
      setIsConnected(false);
      setWalletMethod('');
      localStorage.removeItem('stellarPublicKey');
      localStorage.removeItem('stellarWalletMethod');
      setBalanceInXLM(0);
      console.log('Wallet disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  // Sign transaction using Freighter with better error handling and retries
  const signTransactionWithFreighter = async (xdr) => {
    console.log('Starting transaction signing process with Freighter...');
    
    // Validate transaction XDR before proceeding
    if (!xdr || typeof xdr !== 'string' || xdr.trim() === '') {
      throw new Error('Invalid XDR: Empty or invalid transaction format');
    }
    
    try {
      // Parse the transaction to validate and check details before signing
      let tx;
      try {
        const StellarSdk = window.StellarSdk || (await import('@stellar/stellar-sdk')).default;
        tx = new StellarSdk.Transaction(xdr, StellarSdk.Networks.TESTNET);
        console.log('Successfully parsed transaction XDR');
        console.log('Transaction fee:', tx.fee, 'stroops');
        console.log('Operations count:', tx.operations.length);
        
        // Check transaction sequence number
        console.log('Transaction sequence number:', tx.sequence);
        console.log('Transaction sequence number:', tx.sequence);
        
        // Check transaction fee (minimum recommended is 100 stroops per operation)
        const minRecommendedFee = tx.operations.length * 100;
        if (parseInt(tx.fee) < minRecommendedFee) {
          console.warn(`Warning: Transaction fee (${tx.fee} stroops) is below recommended minimum (${minRecommendedFee} stroops)`);
          console.warn('This may cause transaction to fail with "tx_insufficient_fee" error');
        }
        
        // Check transaction time bounds
        if (tx.timeBounds) {
          const now = Math.floor(Date.now() / 1000);
          if (tx.timeBounds.minTime > now) {
            console.warn(`Transaction not yet valid. Valid from: ${new Date(tx.timeBounds.minTime * 1000).toISOString()}`);
          }
          if (tx.timeBounds.maxTime < now) {
            throw new Error('Transaction has expired. Please create a new transaction.');
          }
          if (tx.timeBounds.maxTime < now + 30) {
            console.warn(`Transaction will expire soon (in ${tx.timeBounds.maxTime - now} seconds)`);
          }
        } else {
          console.warn('Transaction has no time bounds. It will not expire.');
        }
      } catch (parseError) {
        console.warn('Could not parse transaction for validation:', parseError);
        console.warn('Continuing with signing anyway...');
      }
    } catch (validationError) {
      console.warn('Error during transaction validation:', validationError);
      // Continue with signing attempt even if validation fails
    }
    
    // Check if direct Freighter access is available via window.freighter
    const useDirectAccess = typeof window !== 'undefined' && 
                            window.freighter && 
                            typeof window.freighter.signTransaction === 'function';
    
    console.log('Using direct window.freighter access:', useDirectAccess);
    
    // Get network details for signing
    let networkPassphrase;
    let network;
    try {
      // First try to get network from Freighter
      if (useDirectAccess && window.freighter.getNetwork) {
        try {
          network = await window.freighter.getNetwork();
          console.log('Got network from window.freighter:', network);
        } catch (e) {
          console.warn('Error getting network from window.freighter:', e);
        }
      }
      
      // Try to get network from freighterApi if direct access failed
      if (!network) {
        try {
          const networkDetails = await freighterApi.getNetworkDetails();
          network = networkDetails.network;
          console.log('Got network from freighterApi:', network);
        } catch (e) {
          console.warn('Error getting network from freighterApi:', e);
        }
      }
      
      // Default to testnet if we couldn't determine the network
      if (!network) {
        network = process.env.REACT_APP_STELLAR_NETWORK || 'TESTNET';
        console.log(`Defaulting to ${network}`);
      }
      
      // Set network passphrase based on network
      networkPassphrase = network === 'PUBLIC' 
        ? 'Public Global Stellar Network ; September 2015' 
        : 'Test SDF Network ; September 2015';
      
      // Validate that the transaction network matches Freighter's network
      let validationResult;
      let tx;
      try {
        // Load StellarSdk
        const StellarSdk = window.StellarSdk || (await import('@stellar/stellar-sdk')).default;
        
        // Parse and validate transaction
        try {
          tx = new StellarSdk.Transaction(xdr, networkPassphrase);
          validationResult = tx;
          
          // Check network match
          const txNetwork = tx.networkPassphrase;
          const selectedNetwork = network === 'PUBLIC' ? 
            StellarSdk.Networks.PUBLIC : 
            StellarSdk.Networks.TESTNET;
            
          if (txNetwork !== selectedNetwork) {
            console.warn(`Transaction network (${txNetwork}) does not match wallet network (${selectedNetwork})`);
            console.warn('This may cause the transaction to fail');
          }
        } catch (parseError) {
          console.warn('Could not parse transaction for network validation:', parseError);
        }
      } catch (e) {
        console.warn('Could not validate transaction network:', e);
      }
    } catch (e) {
      console.warn('Using default testnet passphrase due to error:', e);
      networkPassphrase = 'Test SDF Network ; September 2015';
      network = 'TESTNET';
    }
    
    // Try to sign the transaction
    let maxAttempts = 3;
    let attempt = 0;
    let lastError = null;
    
    while (attempt < maxAttempts) {
      attempt++;
      console.log(`Signing attempt ${attempt}/${maxAttempts}...`);
      
      try {
        // First, try direct access if available
        if (useDirectAccess) {
          console.log('Attempting to sign with window.freighter.signTransaction...');
          
          try {
            // Call Freighter's signTransaction method
            const result = await window.freighter.signTransaction(xdr, {
              networkPassphrase
            });
            
            console.log('Direct signing result type:', typeof result);
            
            // Process the result based on its type
            if (typeof result === 'string') {
              console.log('Got string result from direct signing');
              if (result.length > 0) {
                return result;
              }
            } else if (result && typeof result === 'object') {
              console.log('Got object result from direct signing with keys:', Object.keys(result));
              
              // Enhanced debugging of result structure
              Object.entries(result).forEach(([key, value]) => {
                const valueType = typeof value;
                const displayValue = valueType === 'string' 
                  ? (value.length > 20 ? `${value.substring(0, 20)}...` : value)
                  : valueType === 'object' ? 'Object' : value;
                console.log(`Direct signing property: ${key} (${valueType})`, displayValue);
              });
              
              // Check for common known response formats in priority order
              if (result.signedXDR && typeof result.signedXDR === 'string') {
                console.log('Using signedXDR property from response');
                return result.signedXDR;
              } else if (result.xdr && typeof result.xdr === 'string') {
                console.log('Using xdr property from response');
                return result.xdr;
              } else if (result.signedTx && typeof result.signedTx === 'string') {
                console.log('Using signedTx property from response');
                return result.signedTx;
              } else if (result.signed_xdr && typeof result.signed_xdr === 'string') {
                console.log('Using signed_xdr property from response');
                return result.signed_xdr;
              } else if (result.transaction && typeof result.transaction === 'string') {
                console.log('Using transaction property from response');
                return result.transaction;
              }
              
              // Look for nested result
              if (result.result && typeof result.result === 'object') {
                console.log('Found nested result object, checking properties');
                const nestedResult = result.result;
                
                if (nestedResult.xdr && typeof nestedResult.xdr === 'string') {
                  console.log('Using result.xdr property from response');
                  return nestedResult.xdr;
                } else if (nestedResult.signedXDR && typeof nestedResult.signedXDR === 'string') {
                  console.log('Using result.signedXDR property from response');
                  return nestedResult.signedXDR;
                }
              }
              
              // Look for any property that contains "xdr" in its name
              const xdrProps = Object.entries(result)
                .filter(([key, value]) => 
                  typeof value === 'string' && 
                  value.length > 0 && 
                  key.toLowerCase().includes('xdr')
                );
              
              if (xdrProps.length > 0) {
                console.log(`Using found property "${xdrProps[0][0]}" containing "xdr" in name`);
                return xdrProps[0][1];
              }
              
              // Check for any string property that looks like a base64 XDR
              const possibleXdrProps = Object.entries(result)
                .filter(([_, value]) => 
                  typeof value === 'string' && 
                  value.length > 32 &&
                  /^[A-Za-z0-9+/=]+$/.test(value) // Base64 regex pattern
                );
              
              if (possibleXdrProps.length > 0) {
                console.log(`Using string property "${possibleXdrProps[0][0]}" with base64 encoded content`);
                return possibleXdrProps[0][1];
              }
            }
            
            // If we got here, the result format wasn't recognized
            console.warn('Unrecognized result format from direct signing:', 
              typeof result, 
              result ? (typeof result === 'object' ? Object.keys(result) : result) : 'null'
            );
            throw new Error('Unrecognized result format from Freighter. Please ensure you have the latest version of Freighter installed.');
          } catch (directError) {
            console.warn(`Direct signing attempt ${attempt} failed:`, directError);
            // Check if this is a user rejection/cancellation
            if (directError.message && (
                directError.message.toLowerCase().includes('cancel') || 
                directError.message.toLowerCase().includes('reject') ||
                directError.message.toLowerCase().includes('denied')
            )) {
              throw directError; // Don't retry user rejections
            }
            // Otherwise, continue to API approach
          }
        }
        
        // Check if we have freighterApi available for signing
        if (typeof freighterApi !== 'undefined' && typeof freighterApi.signTransaction === 'function') {
          // Fallback to freighterApi approach
          console.log(`Using freighterApi.signTransaction (attempt ${attempt})...`);
          
          // 1. First check if we're allowed
          try {
            const allowedCheck = await freighterApi.isAllowed();
            if (!allowedCheck || !allowedCheck.isAllowed) {
              console.log('App not allowed, requesting access...');
              await freighterApi.requestAccess();
            }
          } catch (permissionError) {
            console.warn('Error checking/requesting permission:', permissionError);
            // Continue anyway
          }
          
          // 2. Now try to sign the transaction
          try {
            // Get fresh network details
            const networkDetails = await freighterApi.getNetworkDetails().catch(() => ({
              network: process.env.REACT_APP_STELLAR_NETWORK || 'TESTNET',
              networkPassphrase: process.env.REACT_APP_STELLAR_NETWORK === 'PUBLIC'
                ? 'Public Global Stellar Network ; September 2015'
                : 'Test SDF Network ; September 2015'
            }));
            
            console.log('API signing with network:', networkDetails.network);
            
            // Use the API to sign
            const signResult = await freighterApi.signTransaction(xdr, {
              network: networkDetails.network,
              networkPassphrase: networkDetails.networkPassphrase
            });
            console.log('API signing result type:', typeof signResult);
            
            // Enhanced debugging of result structure
            if (signResult) {
              if (typeof signResult === 'object') {
                console.log('API response is an object with keys:', Object.keys(signResult));
                // Log all the string properties and their values for better debugging
                Object.entries(signResult).forEach(([key, value]) => {
                  const valueType = typeof value;
                  const displayValue = valueType === 'string' 
                    ? (value.length > 20 ? `${value.substring(0, 20)}...` : value)
                    : valueType === 'object' ? 'Object' : value;
                  console.log(`API response property: ${key} (${valueType})`, displayValue);
                });
              } else {
                console.log('API response value:', signResult.length > 20 ? `${signResult.substring(0, 20)}...` : signResult);
              }
            } else {
              console.log('API response is null or undefined');
            }
            
            // Handle the API result with improved response checking
            if (typeof signResult === 'string') {
              console.log('Using string response from API');
              if (signResult.length > 0) {
                return signResult;
              } else {
                throw new Error('Empty string response from Freighter API');
              }
            } else if (signResult && typeof signResult === 'object') {
              // Check for common known response formats in priority order
              
              // 1. Check for signedXDR format (most common in newer versions)
              if (signResult.signedXDR && typeof signResult.signedXDR === 'string') {
                console.log('Using signedXDR property from response');
                return signResult.signedXDR;
              }
              
              // 2. Check for xdr format
              if (signResult.xdr && typeof signResult.xdr === 'string') {
                console.log('Using xdr property from response');
                return signResult.xdr;
              }
              
              // 3. Check for signedTx format
              if (signResult.signedTx && typeof signResult.signedTx === 'string') {
                console.log('Using signedTx property from response');
                return signResult.signedTx;
              }
              
              // 4. Check for signed_xdr format (alternate casing)
              if (signResult.signed_xdr && typeof signResult.signed_xdr === 'string') {
                console.log('Using signed_xdr property from response');
                return signResult.signed_xdr;
              }
              
              // 5. Check for transaction format
              if (signResult.transaction && typeof signResult.transaction === 'string') {
                console.log('Using transaction property from response');
                return signResult.transaction;
              }
              
              // 6. Check for result.result format (nested result)
              if (signResult.result && typeof signResult.result === 'object') {
                console.log('Found nested result object, checking properties');
                const nestedResult = signResult.result;
                
                if (nestedResult.xdr && typeof nestedResult.xdr === 'string') {
                  console.log('Using result.xdr property from response');
                  return nestedResult.xdr;
                }
                
                if (nestedResult.signedXDR && typeof nestedResult.signedXDR === 'string') {
                  console.log('Using result.signedXDR property from response');
                  return nestedResult.signedXDR;
                }
              }
              
              // 7. Look for any property that contains "xdr" in its name and is a string
              const xdrProps = Object.entries(signResult)
                .filter(([key, value]) => 
                  typeof value === 'string' && 
                  value.length > 0 && 
                  key.toLowerCase().includes('xdr')
                );
              
              if (xdrProps.length > 0) {
                console.log(`Using found property "${xdrProps[0][0]}" containing "xdr" in name`);
                return xdrProps[0][1];
              }
              
              // 8. Check for any string property that looks like a base64 XDR
              // XDR is typically base64 encoded and starts with "A" or "g"
              const possibleXdrProps = Object.entries(signResult)
                .filter(([_, value]) => 
                  typeof value === 'string' && 
                  value.length > 32 &&
                  /^[A-Za-z0-9+/=]+$/.test(value) // Base64 regex pattern
                );
              
              if (possibleXdrProps.length > 0) {
                console.log(`Using string property "${possibleXdrProps[0][0]}" with base64 encoded content`);
                return possibleXdrProps[0][1];
              }
              
              // 9. Check if there's an error message in the response
              if (signResult.error) {
                throw new Error(`Freighter API error: ${signResult.error}`);
              }
              
              // If we get here, we couldn't find a valid XDR string in the response
              console.warn('Could not find valid XDR in object response:', signResult);
            }
            
            // If we get here, log a detailed warning about the unrecognized format
            console.warn('Unrecognized response format from freighterApi:', 
              typeof signResult, 
              signResult ? (typeof signResult === 'object' ? Object.keys(signResult) : signResult) : 'null'
            );
            throw new Error('Received unrecognized response format from Freighter API. Please ensure you have the latest version of Freighter installed.');
          } catch (apiError) {
            console.error('API signing error:', apiError);
            
            // Provide more detailed error information
            if (apiError.message) {
              if (apiError.message.includes('User declined')) {
                throw new Error('Transaction signing was cancelled by the user');
              } else if (apiError.message.includes('not connected')) {
                throw new Error('Freighter wallet is locked. Please unlock your wallet and try again.');
              } else if (apiError.message.includes('sequence')) {
                throw new Error('Transaction sequence number issue. Please refresh the page and try again.');
              } else if (apiError.message.includes('fee')) {
                throw new Error('Transaction fee is too low. Please try again with a higher fee.');
              } else if (apiError.message.includes('network')) {
                throw new Error('Network mismatch. Please ensure your wallet is on the same network as the transaction.');
              }
            }
            
            throw apiError;
          }
        } else {
          // Neither window.freighter nor freighterApi are available
          throw new Error('Freighter is not available for transaction signing. Please ensure the Freighter extension is installed and enabled.');
        }
      } catch (attemptError) {
        console.error(`Signing attempt ${attempt} failed:`, attemptError);
        lastError = attemptError;
        
        // Don't retry if user rejected or cancelled
        if (attemptError.message && (
            attemptError.message.toLowerCase().includes('cancel') || 
            attemptError.message.toLowerCase().includes('reject') ||
            attemptError.message.toLowerCase().includes('denied')
        )) {
          throw new Error('Transaction signing was cancelled by the user');
        }
        
        // Check if this is the last attempt
        if (attempt >= maxAttempts) {
          break;
        }
        
        // Wait before retrying
        const delay = 1000 * attempt;
        console.log(`Waiting ${delay}ms before retry...`);
        
        // Log detailed information about the error for debugging
        if (attemptError.response) {
          console.error('Error response details:');
          if (attemptError.response.status) console.error('Status:', attemptError.response.status);
          if (attemptError.response.statusText) console.error('Status text:', attemptError.response.statusText);
          if (attemptError.response.data) {
            console.error('Response data:', attemptError.response.data);
            if (attemptError.response.data.extras && attemptError.response.data.extras.result_codes) {
              console.error('Result codes:', attemptError.response.data.extras.result_codes);
            }
          }
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error(`Failed to sign transaction after ${maxAttempts} attempts`);
  };
  
  // Get account details with retry
  const getAccountDetails = async (accountAddress) => {
    if (!accountAddress && !publicKey) {
      throw new Error('No account address provided');
    }
    
    const address = accountAddress || publicKey;
    console.log(`Getting account details for ${address.substring(0, 5)}...${address.substring(address.length - 5)}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const account = await server.loadAccount(address);
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
  
  /**
   * Signs a transaction using the currently connected wallet.
   * Accepts either a transaction object or an XDR string.
   * @param {Object|string} transaction - The transaction to sign (either Transaction object or XDR string)
   * @returns {Promise<string>} - The signed transaction XDR
   */
  const signTransaction = async (transaction) => {
    try {
      setWalletStatus('signing');
      
      // Check if transaction is already an XDR string
      let xdr;
      
      if (typeof transaction === 'string') {
        console.log('Transaction provided as XDR string');
        xdr = transaction;
      } else {
        console.log('Converting transaction object to XDR');
        // Convert transaction to XDR
        xdr = transaction.toXDR();
      }
      
      console.log('Delegating to signTransactionWithFreighter');
      
      // Check if wallet is connected
      if (!publicKey) {
        throw new Error('No wallet connected. Please connect a wallet before signing.');
      }
      
      // Validate the transaction before signing
      const validation = await validateTransaction(xdr);
      if (validation && !validation.valid) {
        throw new Error(validation.error || 'Transaction validation failed');
      }
      
      // Use validation.tx if available
      let validatedTx = validation && validation.tx;
      
      // Sign the transaction using the freighter-specific method
      // We'll attempt to sign even if window.freighter is not detected directly
      try {
        const signedXdr = await signTransactionWithFreighter(xdr);
        console.log('Transaction signed successfully');
        setWalletStatus('connected');
        return signedXdr;
      } catch (signingError) {
        // If signing failed but we're using freighterApi, try that directly
        if (signingError.message && signingError.message.includes('Freighter wallet not installed') && 
            typeof freighterApi.signTransaction === 'function') {
          return await handleFallbackSigning(xdr);
        }
        
        // If it wasn't the "not installed" error or the fallback failed, rethrow
        throw signingError;
      }
    } catch (error) {
      console.error('Error signing transaction:', error);
      setWalletStatus('error');
      throw error;
    }
  };
  
  // Check if an account is funded
  const checkAccountFunding = async (address) => {
    try {
      await server.loadAccount(address);
      return { funded: true, message: 'Account is funded and ready to use' };
    } catch (error) {
      console.error('Error checking account funding:', error);
      
      if (error.response && error.response.status === 404) {
        return { 
          funded: false, 
          message: 'This account does not exist on the Stellar network. Please fund it first.' 
        };
      }
      
      // Network or server errors
      if (error.message && error.message.includes('Network Error')) {
        return {
          funded: null,
          message: 'Network error while checking account. Please verify your internet connection.'
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
    checkAccountFunding,
    signTransactionWithFreighter,
    walletStatus
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