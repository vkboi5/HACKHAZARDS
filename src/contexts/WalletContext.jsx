import React, { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { StellarWalletsKit, WalletNetwork } from '@creit.tech/stellar-wallets-kit';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Keypair, Networks, TransactionBuilder, Operation, Transaction } from '@stellar/stellar-sdk';
import web3AuthStellarService from '../services/web3AuthStellarService';
import { authService } from '../services';
import { toast } from 'react-hot-toast';
import { storeWalletData, retrieveWalletData, deleteWalletData } from '../services/walletStorageService';

// Configuration object - should be imported from a config file in a real app
const GALERIE_CONFIG = {
  STELLAR_NETWORK: import.meta.env.VITE_STELLAR_NETWORK || "TESTNET"
};

const WalletContext = createContext();

// Function to sign and submit transactions when using Web3Auth
export const signAndSubmitTransactionFromWalletContext = async (xdrString, walletContextValue) => {
  // Make sure web3AuthStellarService is accessible and initialized
  if (!web3AuthStellarService) {
    throw new Error('Web3Auth Stellar service not available');
  }
  
  try {
    console.log("Signing transaction with Web3Auth wallet");
    const networkPassphrase = import.meta.env.VITE_STELLAR_NETWORK === "TESTNET" 
      ? Networks.TESTNET 
      : Networks.PUBLIC;
    
    const server = new StellarSdk.Horizon.Server(
      import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    );
    
    // Instead of using a hook, accept the context value as a parameter
    const walletContext = walletContextValue;
    
    // Get the user's private key using the secure method
    let privateKey;
    try {
      privateKey = await walletContext.getPrivateKey();
      if (!privateKey) {
        throw new Error('Private key not available - please log in again');
      }
    } catch (error) {
      // Fallback to localStorage if context method fails (this should be removed in production)
      privateKey = localStorage.getItem('tempPrivateKey');
      if (!privateKey) {
        throw new Error('Private key not available - please log in again');
      }
      console.warn('Using fallback private key method - this is less secure');
    }
    
    // Create a Stellar keypair from the private key
    let keypair;
    try {
      keypair = StellarSdk.Keypair.fromSecret(privateKey);
      console.log("Successfully created keypair from private key");
    } catch (keypairError) {
      console.error("Error creating keypair:", keypairError);
      // Try to use a different approach for Web3Auth key
      try {
        // Create a deterministic keypair based on the Web3Auth key
        const encoder = new TextEncoder();
        const data = encoder.encode(privateKey);
        const hash = await crypto.subtle.digest('SHA-256', data);
        const seed = new Uint8Array(hash).slice(0, 32);
        keypair = StellarSdk.Keypair.fromRawEd25519Seed(seed);
        console.log("Created deterministic keypair from hashed private key");
      } catch (fallbackError) {
        console.error("Fallback keypair creation failed:", fallbackError);
        throw new Error("Could not create a valid keypair from private key");
      }
    }
    
    // Parse the XDR string using the proper method
    try {
      console.log("Parsing transaction XDR");
      const transaction = StellarSdk.TransactionBuilder.fromXDR(
        xdrString,
        networkPassphrase
      );
      
      // Sign the transaction with the user's keypair
      console.log("Signing transaction with keypair");
      transaction.sign(keypair);
      
      // Convert back to XDR for submission
      const signedXDR = transaction.toXDR();
      console.log("Transaction signed successfully");
      
      // Submit the signed transaction to the Stellar network
      console.log("Submitting transaction to Stellar network");
      const result = await server.submitTransaction(transaction);
      console.log("Transaction submitted successfully:", result);
      
      return result;
    } catch (transactionError) {
      console.error("Error processing transaction:", transactionError);
      throw new Error(`Transaction processing error: ${transactionError.message}`);
    }
  } catch (error) {
    console.error("Error signing transaction with Web3Auth wallet:", error);
    throw error;
  }
};

// Function to get the stored Web3Auth private key
export const getStoredWeb3AuthPrivateKey = async () => {
  try {
    const privateKey = localStorage.getItem('tempPrivateKey');
    if (!privateKey) {
      throw new Error('Private key not available - please log in again');
    }
    return privateKey;
  } catch (error) {
    console.error('Error retrieving stored private key:', error);
    throw error;
  }
};

export const WalletProvider = ({ children }) => {
  const [web3Auth, setWeb3Auth] = useState(null);
  const [stellarKit, setStellarKit] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authType, setAuthType] = useState(null); // 'web3auth' or 'traditional'
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);

  useEffect(() => {
    const initWeb3Auth = async () => {
      try {
        // Only initialize if not already done
        if (web3Auth) {
          console.log("Web3Auth already initialized in WalletContext");
          return;
        }
        
        console.log("Initializing Web3Auth in WalletContext");
        
        // Initialize Web3Auth with timeout and error handling
        const web3auth = new Web3Auth({
          clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID,
          chainConfig: {
            chainNamespace: "other",
            chainId: "0x1",
            rpcTarget: "https://horizon-testnet.stellar.org",
            displayName: "Stellar Testnet",
            blockExplorer: "https://stellar.expert/explorer/testnet",
            ticker: "XLM",
            tickerName: "Stellar",
          },
          web3AuthNetwork: import.meta.env.VITE_WEB3AUTH_NETWORK || "testnet",
        });

        const openloginAdapter = new OpenloginAdapter({
          loginConfig: {
            jwt: {
              name: "Email/Password",
              verifier: import.meta.env.VITE_WEB3AUTH_VERIFIER || "galerie-auth",
              typeOfLogin: "jwt",
              clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID,
            },
          },
        });

        web3auth.configureAdapter(openloginAdapter);
        
        try {
          // Add timeout to prevent hanging
          const initPromise = web3auth.initModal();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Web3Auth initialization timed out")), 15000);
          });
          
          await Promise.race([initPromise, timeoutPromise]);
          setWeb3Auth(web3auth);
          console.log("Web3Auth initialized successfully in WalletContext");
        } catch (modalError) {
          // Check for rate limit errors
          if (modalError.message && (
              modalError.message.includes("429") ||
              modalError.message.includes("Too Many Requests") ||
              modalError.message.includes("failed to fetch")
          )) {
            console.warn("Rate limited during Web3Auth initialization. Please try again later.");
            toast.warning("Authentication service is currently busy. Please try again in a few minutes.");
          } else {
            console.error("Error initializing Web3Auth modal:", modalError);
            setError("Failed to initialize authentication. Please try again later.");
            toast.error("Authentication system initialization failed");
          }
          return;
        }

        // Initialize Stellar Wallets Kit - don't use static build method
        try {
          const kit = new StellarWalletsKit({
            network: GALERIE_CONFIG.STELLAR_NETWORK === "TESTNET" 
              ? WalletNetwork.TESTNET 
              : WalletNetwork.PUBLIC,
            selectedWalletId: undefined, // Let the user select
          });
          setStellarKit(kit);
          console.log("Successfully initialized StellarWalletsKit");
        } catch (kitError) {
          console.error("Error initializing StellarWalletsKit:", kitError);
        }
        
        // Check if user is already logged in with Web3Auth
        if (web3auth.connected) {
          console.log("User is already connected to Web3Auth, retrieving session");
          try {
            const provider = web3auth.provider;
            if (provider) {
              const userInfo = await web3auth.getUserInfo();
              console.log("Retrieved user info:", userInfo);
              
              // Get private key from provider
              const privateKey = await provider.request({ method: "private_key" });
              if (privateKey) {
                console.log("Successfully retrieved private key from existing session");
                // Save for this session
                localStorage.setItem('tempPrivateKey', privateKey);
                await handleStellarWalletCreation(privateKey);
                setAuthType('web3auth');
              } else {
                console.warn("Web3Auth is connected but couldn't get private key");
              }
            } else {
              console.warn("Web3Auth is connected but provider is not available");
            }
          } catch (existingSessionError) {
            console.error("Error handling existing Web3Auth session:", existingSessionError);
          }
        } 
        // Check if user is logged in with traditional auth
        else if (authService.isLoggedIn()) {
          const currentUser = authService.getCurrentUser();
          if (currentUser && currentUser.publicKey) {
            setPublicKey(currentUser.publicKey);
            setIsLoggedIn(true);
            setAuthType('traditional');
            
            // Get the wallet balance
            try {
              const balance = await web3AuthStellarService.getAccountBalance(currentUser.publicKey);
              setWalletBalance(balance);
            } catch (err) {
              console.error("Error getting balance for traditional login:", err);
            }
          }
        }
        
        // Check for temp private key
        const tempPrivateKey = localStorage.getItem('tempPrivateKey');
        if (tempPrivateKey) {
          try {
            console.log("Found temporary private key, creating Stellar wallet");
            await handleStellarWalletCreation(tempPrivateKey);
            setAuthType('web3auth');
            // Clear the temp key after use
            localStorage.removeItem('tempPrivateKey');
          } catch (err) {
            console.error("Error creating wallet from temp key:", err);
          }
        }
      } catch (error) {
        console.error("Error initializing Web3Auth:", error);
        setError("Failed to initialize Web3Auth");
        toast.error("Authentication system failed to initialize");
      }
    };

    initWeb3Auth();
    
    // Listen for Web3Auth login events
    const handleWeb3AuthLogin = async (event) => {
      try {
        console.log("Web3Auth login event detected", event);
        
        // Check if the event contains the necessary data
        if (!event.detail) {
          console.warn("Web3Auth event missing detail property");
          return;
        }
        
        const { privateKey, user, publicKey: stellarPublicKey } = event.detail;
        
        if (privateKey) {
          console.log("Private key received from login event, creating wallet");
          // Temporarily store the private key
          localStorage.setItem('tempPrivateKey', privateKey);
          
          // If stellar public key is provided in the event, use it directly
          if (stellarPublicKey) {
            console.log("Using Stellar public key from Web3Auth event:", stellarPublicKey);
            setPublicKey(stellarPublicKey);
            setIsLoggedIn(true);
            setAuthType('web3auth');
            
            // Store wallet data
            const userIdentifier = user?.email || user?.sub || stellarPublicKey;
            try {
              await storeWalletData(stellarPublicKey, { 
                privateKey,
                publicKey: stellarPublicKey,
                network: GALERIE_CONFIG.STELLAR_NETWORK,
                createdAt: new Date().toISOString()
              }, userIdentifier);
              console.log('Wallet data securely stored with Stellar public key');
              
              // Remove temporary storage once confirmed
              localStorage.removeItem('tempPrivateKey');
            } catch (storageError) {
              console.error('Failed to store wallet data:', storageError);
              // Keep the private key in localStorage as fallback
            }
            
            // Load account balance
            await refreshBalance();
          } else {
            // Fall back to creating a new wallet if no public key provided
            await handleStellarWalletCreation(privateKey);
            setAuthType('web3auth');
          }
        } else if (web3Auth && web3Auth.connected) {
          // If no private key in event but web3Auth is connected, try to get it directly
          console.log("No private key in event, but Web3Auth is connected. Getting key from provider...");
          try {
            const provider = web3Auth.provider;
            if (provider) {
              const pk = await provider.request({ method: "private_key" });
              if (pk) {
                localStorage.setItem('tempPrivateKey', pk);
                await handleStellarWalletCreation(pk);
                setAuthType('web3auth');
              } else {
                throw new Error("Couldn't retrieve private key from Web3Auth provider");
              }
            }
          } catch (providerError) {
            console.error("Error getting private key from provider:", providerError);
            setError("Failed to get private key after login");
            toast.error("Could not access your wallet credentials");
          }
        } else {
          console.warn("Web3Auth login event missing privateKey, and Web3Auth not connected");
          setError("Incomplete login data received");
          toast.error("Login process incomplete. Please try again.");
        }
      } catch (err) {
        console.error("Error handling Web3Auth login event:", err);
        setError("Failed to create Stellar wallet after login");
        toast.error("Wallet setup failed after login");
      }
    };
    
    window.addEventListener('web3AuthLogin', handleWeb3AuthLogin);
    
    return () => {
      window.removeEventListener('web3AuthLogin', handleWeb3AuthLogin);
    };
  }, []);

  // Handle wallet creation and setup
  const handleStellarWalletCreation = async (privateKey) => {
    try {
      // Create a new instance of StellarWalletsKit instead of using static build method
      const walletKit = new StellarWalletsKit({
        network: GALERIE_CONFIG.STELLAR_NETWORK === "TESTNET" 
          ? WalletNetwork.TESTNET 
          : WalletNetwork.PUBLIC
      });

      const wallet = await web3AuthStellarService.createStellarWallet(privateKey);
      
      if (!wallet || !wallet.publicKey) {
        throw new Error("Failed to create Stellar wallet");
      }
      
      const publicKey = wallet.publicKey;
      
      // Set state for the wallet
      setPublicKey(publicKey);
      setIsLoggedIn(true);
      
      // Get a unique identifier for encrypting the wallet data
      // Use Web3Auth user info or traditional auth user id
      let userIdentifier;
      if (web3Auth && web3Auth.connected) {
        const userInfo = await web3Auth.getUserInfo();
        userIdentifier = userInfo.email || userInfo.sub || publicKey;
      } else if (authType === 'traditional') {
        const currentUser = authService.getCurrentUser();
        userIdentifier = currentUser?.email || publicKey;
      } else {
        userIdentifier = publicKey; // Fallback to using publicKey as identifier
      }
      
      // Store the wallet data securely in IPFS
      try {
        await storeWalletData(publicKey, { 
          privateKey,
          publicKey,
          network: GALERIE_CONFIG.STELLAR_NETWORK,
          createdAt: new Date().toISOString()
        }, userIdentifier);
        console.log('Wallet data securely stored in IPFS');
        
        // Remove any temporary storage once confirmed in IPFS
        localStorage.removeItem('tempPrivateKey');
        localStorage.removeItem('stellarPrivateKey');
      } catch (storageError) {
        console.error('Failed to store wallet data in IPFS:', storageError);
        // Fallback to localStorage for this session only
        localStorage.setItem('tempPrivateKey', privateKey);
        toast.warning("Using local storage as fallback for wallet data");
      }
      
      // Load account balance
      await refreshBalance();
      
      return publicKey;
    } catch (error) {
      console.error("Error creating/setting up Stellar wallet:", error);
      setError("Failed to create Stellar wallet: " + error.message);
      toast.error("Wallet setup failed");
      return null;
    }
  };

  // Login with Web3Auth
  const loginWithWeb3Auth = async () => {
    try {
      setIsLoading(true);
      if (!web3Auth) {
        setError("Web3Auth not initialized");
        toast.error("Authentication system not ready. Please try again.");
        return;
      }

      // Connect using Web3Auth
      console.log("Connecting to Web3Auth...");
      const web3AuthProvider = await web3Auth.connect();
      if (!web3AuthProvider) {
        throw new Error("Failed to connect with Web3Auth");
      }

      // Set auth type
      setAuthType("web3auth");

      // Get private key from provider with proper error handling
      let privateKey;
      try {
        privateKey = await web3AuthProvider.request({ method: "private_key" });
        console.log("Successfully obtained private key");
      } catch (pkError) {
        console.error("Error getting private key:", pkError);
        throw new Error("Could not access your wallet credentials");
      }
      
      if (!privateKey) {
        throw new Error("Failed to get private key from Web3Auth");
      }

      // Temporarily store the private key for this session
      localStorage.setItem('tempPrivateKey', privateKey);

      // Create Stellar wallet using the private key
      const publicKey = await handleStellarWalletCreation(privateKey);
      
      toast.success("Login successful with Web3Auth!");
      return publicKey;
    } catch (error) {
      console.error("Web3Auth login error:", error);
      setError("Failed to login with Web3Auth: " + error.message);
      toast.error("Login failed with Web3Auth");
    } finally {
      setIsLoading(false);
    }
  };

  // Login with traditional methods (email, password)
  const loginWithTraditional = async (email, password) => {
    try {
      setIsLoading(true);
      
      // Authenticate with the backend service
      const result = await authService.login(email, password);
      if (!result.success) {
        throw new Error(result.message || "Authentication failed");
      }
      
      // Set auth type
      setAuthType("traditional");
      
      // Check if user has existing wallet data in IPFS
      try {
        // We need to have some way to know the user's publicKey
        // This could come from the user profile or a mapping stored in your backend
        const userPublicKey = result.publicKey || result.walletAddress;
        
        if (userPublicKey) {
          setPublicKey(userPublicKey);
          
          // Try to retrieve existing wallet data
          const walletData = await retrieveWalletData(userPublicKey);
          if (walletData && walletData.privateKey) {
            // User has existing wallet, use it
            console.log('Retrieved existing wallet data from IPFS');
            await handleStellarWalletCreation(walletData.privateKey);
            toast.success("Login successful!");
            return userPublicKey;
          }
        }
      } catch (storageError) {
        console.error('Error retrieving wallet data:', storageError);
        // Continue with wallet creation if retrieval fails
      }
      
      // Generate a new keypair for the user if they don't have one
      const keypair = Keypair.random();
      const privateKey = keypair.secret();
      
      // Create a new Stellar wallet using the generated private key
      const publicKey = await handleStellarWalletCreation(privateKey);
      
      toast.success("Login successful!");
      return publicKey;
    } catch (error) {
      console.error("Traditional login error:", error);
      setError("Failed to login: " + error.message);
      toast.error("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Register a new traditional user
  const registerTraditional = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { success, user } = await authService.register(email, password);
      
      if (success && user) {
        toast.success("Registration successful! Please login.");
        return true;
      } else {
        throw new Error("Registration failed");
      }
    } catch (error) {
      console.error("Error during registration:", error);
      setError("Failed to register: " + error.message);
      toast.error("Registration failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      
      // Clean up IPFS storage if we have a public key
      if (publicKey) {
        try {
          // Get the same user identifier used for storage
          let userIdentifier;
          if (web3Auth && web3Auth.connected) {
            try {
              const userInfo = await web3Auth.getUserInfo();
              userIdentifier = userInfo.email || userInfo.sub || publicKey;
            } catch (e) {
              console.warn("Error getting Web3Auth user info during logout:", e);
              userIdentifier = publicKey;
            }
          } else if (authType === 'traditional') {
            const currentUser = authService.getCurrentUser();
            userIdentifier = currentUser?.email || publicKey;
          } else {
            userIdentifier = publicKey;
          }
          
          await deleteWalletData(publicKey, userIdentifier);
          console.log('Wallet data deleted from IPFS');
        } catch (e) {
          console.error('Error deleting wallet data from IPFS:', e);
        }
      }
      
      // Clear localStorage backup
      localStorage.removeItem('tempPrivateKey');
      localStorage.removeItem('stellarPrivateKey');
      
      // Logout from Web3Auth if connected
      if (web3Auth && web3Auth.connected) {
        await web3Auth.logout();
      }
      
      // Logout from traditional auth if needed
      if (authType === 'traditional') {
        authService.logout();
      }
      
      // Reset state
      setIsLoggedIn(false);
      setPublicKey(null);
      setWalletBalance(null);
      setAuthType(null);
      
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Error during logout:", error);
      setError("Failed to logout: " + error.message);
      toast.error("Logout failed");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshBalance = async () => {
    if (!publicKey) {
      console.warn("Cannot refresh balance: No public key available");
      return;
    }
    
    try {
      setIsBalanceLoading(true);
      const balance = await web3AuthStellarService.getAccountBalance(publicKey);
      setWalletBalance(balance);
      console.log("Balance refreshed successfully", balance);
      return balance;
    } catch (error) {
      console.error("Error refreshing balance:", error);
      toast.error("Failed to refresh wallet balance");
      return null;
    } finally {
      setIsBalanceLoading(false);
    }
  };

  const buyWithMoonpay = async (amount) => {
    if (!isLoggedIn || !publicKey) {
      toast.error("Please log in and create a wallet first");
      return;
    }

    try {
      console.log("Initializing MoonPay purchase with wallet:", { publicKey });
      const moonpayConfig = await web3AuthStellarService.initializeMoonpayPurchase(publicKey, amount);
      
      if (!moonpayConfig || !moonpayConfig.url) {
        throw new Error("Failed to initialize MoonPay - missing configuration or URL");
      }
      
      // Check if we have the MoonPay SDK available
      if (!window.MoonPayWebSdk) {
        console.log("Loading MoonPay SDK");
        // Try to open directly instead
        const moonpayWindow = window.open(moonpayConfig.url, "_blank");
        
        // Check if popup was blocked
        if (!moonpayWindow || moonpayWindow.closed || typeof moonpayWindow.closed === 'undefined') {
          toast.error("Popup blocked! Please allow popups for this site.");
          return null;
        }
        
        toast.success("MoonPay purchase window opened");
        
        // Create a mechanism to detect when the purchase is complete
        const checkInterval = setInterval(() => {
          if (moonpayWindow.closed) {
            clearInterval(checkInterval);
            // Refresh balance after window is closed
            refreshBalance();
            toast.info("Refreshing balance after MoonPay transaction");
          }
        }, 1000);
        
        return moonpayConfig;
      }
      
      // Use MoonPay SDK if available
      try {
        console.log("Using MoonPay SDK");
        // Initialize MoonPay widget
        const moonpaySdk = new window.MoonPayWebSdk.default({
          flow: 'buy',
          environment: moonpayConfig.environment,
          variant: 'overlay', // 'overlay' or 'drawer'
        });
        
        // Open MoonPay widget with custom configuration
        moonpaySdk.show({
          apiKey: moonpayConfig.apiKey,
          currencyCode: moonpayConfig.currencyCode,
          walletAddress: publicKey,
          baseCurrencyAmount: amount,
          redirectURL: window.location.origin
        });
        
        // Listen for transaction completion
        moonpaySdk.on('onTransactionComplete', () => {
          console.log('MoonPay transaction completed');
          moonpaySdk.close();
          refreshBalance();
          toast.success('Purchase successful! Your balance will update shortly.');
        });
        
        moonpaySdk.on('onClose', () => {
          console.log('MoonPay widget closed');
          // Attempt to refresh balance in case a transaction was completed
          refreshBalance();
        });
        
        toast.success("MoonPay purchase initialized");
        return moonpayConfig;
      } catch (sdkError) {
        console.error("Error initializing MoonPay SDK:", sdkError);
        // Fallback to URL method
        window.open(moonpayConfig.url, "_blank");
        toast.warning("Using fallback method for MoonPay purchase");
        return moonpayConfig;
      }
    } catch (error) {
      console.error("MoonPay purchase error:", error);
      toast.error(`Failed to initialize MoonPay purchase: ${error.message}`);
      return null;
    }
  };

  // Add a function to get the private key from IPFS or Web3Auth
  const getPrivateKey = async () => {
    try {
      // First try to get from IPFS
      if (publicKey) {
        // Get the same user identifier used for storage
        let userIdentifier;
        if (web3Auth && web3Auth.connected) {
          try {
            const userInfo = await web3Auth.getUserInfo();
            userIdentifier = userInfo.email || userInfo.sub || publicKey;
          } catch (e) {
            console.error("Error getting Web3Auth user info:", e);
            userIdentifier = publicKey;
          }
        } else if (authType === 'traditional') {
          const currentUser = authService.getCurrentUser();
          userIdentifier = currentUser?.email || publicKey;
        } else {
          userIdentifier = publicKey;
        }
        
        const walletData = await retrieveWalletData(publicKey, userIdentifier);
        if (walletData && walletData.privateKey) {
          console.log('Retrieved private key from IPFS');
          return walletData.privateKey;
        }
      }
      
      // Then check localStorage (as fallback)
      const storedKey = localStorage.getItem('tempPrivateKey');
      if (storedKey) {
        console.log('Retrieved private key from localStorage');
        return storedKey;
      }
      
      // Then try to get from Web3Auth if connected
      if (web3Auth && web3Auth.connected) {
        const provider = web3Auth.provider;
        if (provider) {
          try {
            console.log('Requesting private key from Web3Auth provider');
            const privateKey = await provider.request({ method: "private_key" });
            
            // If we successfully retrieved it, store it in IPFS for future use
            if (privateKey && publicKey) {
              try {
                // Get user identifier
                let userIdentifier;
                try {
                  const userInfo = await web3Auth.getUserInfo();
                  userIdentifier = userInfo.email || userInfo.sub || publicKey;
                } catch {
                  userIdentifier = publicKey;
                }
                
                // Store the key for future use
                await storeWalletData(publicKey, {
                  privateKey,
                  publicKey,
                  network: GALERIE_CONFIG.STELLAR_NETWORK,
                  createdAt: new Date().toISOString(),
                  source: 'web3auth_retrieval'
                }, userIdentifier);
                console.log('Retrieved and stored private key from Web3Auth');
              } catch (storageError) {
                console.warn('Could not store retrieved Web3Auth key in IPFS:', storageError);
              }
            }
            
            return privateKey;
          } catch (e) {
            console.error("Error getting private key from provider:", e);
          }
        }
      }
      
      throw new Error('No private key available');
    } catch (error) {
      console.error('Error retrieving private key:', error);
      throw error;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        isLoggedIn,
        publicKey,
        walletBalance,
        isLoading,
        error,
        login: loginWithWeb3Auth, // Backward compatibility
        loginWithWeb3Auth,
        loginWithTraditional,
        registerTraditional,
        logout,
        refreshBalance,
        buyWithMoonpay,
        stellarKit,
        authType,
        getPrivateKey // Add this function to the context
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  return useContext(WalletContext);
}; 