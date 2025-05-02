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
      // Create a new instance of StellarWalletsKit 
      const walletKit = new StellarWalletsKit({
        network: GALERIE_CONFIG.STELLAR_NETWORK === "TESTNET" 
          ? WalletNetwork.TESTNET 
          : WalletNetwork.PUBLIC
      });
      
      // Save the wallet kit in state
      setStellarKit(walletKit);

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
        // Fallback - keep the private key in localStorage until we can store it securely
        localStorage.setItem('tempPrivateKey', privateKey);
      }
      
      // Attempt to fund the account if it's new
      try {
        const accountData = await web3AuthStellarService.fundAccount(publicKey);
        if (accountData.isNew) {
          console.log('New account funded successfully');
        } else {
          console.log('Existing account detected, no funding needed');
        }
      } catch (fundingError) {
        console.error('Error funding account:', fundingError);
        // Non-fatal error - account might already exist or funding might not be necessary
      }
      
      // Load initial balance
      await refreshBalance();
      
      return publicKey;
    } catch (error) {
      console.error("Error creating Stellar wallet:", error);
      setError("Failed to create Stellar wallet: " + error.message);
      toast.error("Failed to setup your wallet");
      throw error;
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

  const buyWithMoonpay = async (nftId, amount, nftDetails = null) => {
    try {
      console.log("Initializing MoonPay purchase with wallet:", { publicKey, amount, nftId });
      
      // Create NFT details object if nftId is provided but nftDetails isn't
      const nftDetailsToUse = nftDetails || (nftId ? { id: nftId } : null);
      
      if (nftDetailsToUse) {
        console.log("Using NFT details for MoonPay purchase:", nftDetailsToUse);
      }
      
      const moonpayConfig = await web3AuthStellarService.initializeMoonpayPurchase(
        publicKey, 
        amount, 
        nftDetailsToUse
      );
      
      if (!moonpayConfig || !moonpayConfig.url) {
        throw new Error("Failed to initialize MoonPay - missing configuration or URL");
      }
      
      // Check if we have the MoonPay SDK available
      if (typeof window.MoonPay === 'undefined') {
        console.log("MoonPay SDK not available, adding the script dynamically");
        
        try {
          // Try to add the SDK dynamically
          const script = document.createElement('script');
          script.src = 'https://sdk.moonpay.com/sdk.js';
          script.async = true;
          
          // Create a promise to wait for the script to load
          const scriptLoadPromise = new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load MoonPay SDK script'));
          });
          
          document.head.appendChild(script);
          await scriptLoadPromise;
          console.log("MoonPay SDK loaded dynamically");
          
          // Give a small delay for initialization
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (scriptError) {
          console.error("Error loading MoonPay SDK script:", scriptError);
          // Fallback to embedded iframe instead of opening in new tab
          createMoonpayIframe(moonpayConfig.url);
          toast.warning("Using embedded iframe for MoonPay purchase");
          return moonpayConfig;
        }
      }
      
      // Try to use MoonPay SDK
      try {
        console.log("Initializing MoonPay widget");
        
        // Initialize MoonPay widget
        const moonpaySDK = new window.MoonPay.Modal({
          environment: moonpayConfig.environment === 'production' ? 'production' : 'sandbox',
          variant: 'overlay',
        });
        
        // Configure for regular XLM purchase (works for both regular and NFT purchases)
        const widgetConfig = {
          apiKey: moonpayConfig.apiKey,
          currencyCode: 'xlm',
          walletAddress: publicKey,
          baseCurrencyCode: moonpayConfig.baseCurrencyCode || 'usd',
          baseCurrencyAmount: moonpayConfig.baseCurrencyAmount,
          redirectURL: window.location.origin,
        };
        
        // Log the NFT information if this is an NFT purchase
        if (nftDetailsToUse) {
          console.log("Opening MoonPay for NFT purchase:", nftDetailsToUse.name || nftDetailsToUse.id);
        }
        
        // Open MoonPay widget with configuration
        moonpaySDK.open(widgetConfig);
        
        // Listen for transaction completion
        moonpaySDK.on('onTransactionComplete', async (event) => {
          console.log('MoonPay transaction completed:', event);
          
          // Try to get and store the private key after a successful transaction
          if (web3Auth && web3Auth.connected) {
            try {
              const provider = web3Auth.provider;
              if (provider) {
                const privateKey = await provider.request({ method: "private_key" });
                if (privateKey) {
                  // Always store in localStorage for immediate use after MoonPay transaction
                  localStorage.setItem('tempPrivateKey', privateKey);
                  console.log('Stored Web3Auth key in localStorage after MoonPay transaction');
                  
                  // Attempt to store in IPFS as well
                  try {
                    const userInfo = await web3Auth.getUserInfo();
                    const userIdentifier = userInfo.email || userInfo.sub || publicKey;
                    
                    await storeWalletData(publicKey, {
                      privateKey,
                      publicKey,
                      network: GALERIE_CONFIG.STELLAR_NETWORK,
                      createdAt: new Date().toISOString(),
                      source: 'moonpay_transaction'
                    }, userIdentifier);
                    console.log('Stored private key to IPFS after MoonPay transaction');
                  } catch (storageError) {
                    console.warn('Could not store key to IPFS after MoonPay transaction:', storageError);
                  }
                }
              }
            } catch (keyError) {
              console.warn('Could not retrieve private key after MoonPay transaction:', keyError);
            }
          }
          
          // Refresh balance
          refreshBalance();
          
          if (nftDetailsToUse) {
            toast.success(`Purchase of XLM for NFT "${nftDetailsToUse.name || nftDetailsToUse.id}" successful! Your balance will update shortly.`);
          } else {
            toast.success('Purchase successful! Your balance will update shortly.');
          }
        });
        
        moonpaySDK.on('onClose', () => {
          console.log('MoonPay widget closed');
          // Attempt to refresh balance in case a transaction was completed
          refreshBalance();
        });
        
        toast.success("MoonPay purchase initialized");
        return moonpayConfig;
      } catch (sdkError) {
        console.error("Error initializing MoonPay widget:", sdkError);
        // Fallback to embedded iframe instead of opening in new tab
        createMoonpayIframe(moonpayConfig.url);
        toast.warning("Using embedded iframe for MoonPay purchase");
        return moonpayConfig;
      }
    } catch (error) {
      console.error("MoonPay purchase error:", error);
      toast.error(`Failed to initialize MoonPay purchase: ${error.message}`);
      return null;
    }
  };

  // Helper function to create an embedded iframe for MoonPay
  const createMoonpayIframe = (url) => {
    // Remove any existing iframe
    const existingIframe = document.getElementById('moonpay-iframe-container');
    if (existingIframe) {
      existingIframe.remove();
    }
    
    // Create container for the iframe
    const container = document.createElement('div');
    container.id = 'moonpay-iframe-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    
    // Create the iframe
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '90%';
    iframe.style.maxWidth = '500px';
    iframe.style.height = '90%';
    iframe.style.maxHeight = '700px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';
    iframe.style.backgroundColor = 'white';
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '20px';
    closeButton.style.right = '20px';
    closeButton.style.backgroundColor = 'white';
    closeButton.style.color = 'black';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '50%';
    closeButton.style.width = '40px';
    closeButton.style.height = '40px';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.display = 'flex';
    closeButton.style.justifyContent = 'center';
    closeButton.style.alignItems = 'center';
    closeButton.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    
    // Add click event to close button
    closeButton.addEventListener('click', () => {
      container.remove();
      refreshBalance();
    });
    
    // Add elements to the DOM
    container.appendChild(iframe);
    container.appendChild(closeButton);
    document.body.appendChild(container);
  };

  // Sign a transaction with the user's private key from Web3Auth
  const signTransaction = async (xdr) => {
    try {
      console.log("WalletContext: Signing transaction with Web3Auth", { publicKey, isLoggedIn });
      
      if (!isLoggedIn || !publicKey) {
        throw new Error("Wallet not connected or user not logged in");
      }
      
      // Get the network configuration
      const networkPassphrase = GALERIE_CONFIG.STELLAR_NETWORK === "TESTNET" 
        ? Networks.TESTNET 
        : Networks.PUBLIC;
      
      // Get the private key securely
      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error("Could not retrieve private key");
      }
      
      // Create a Stellar keypair from the private key
      let keypair;
      try {
        // Try direct conversion first
        keypair = Keypair.fromSecret(privateKey);
        console.log("Created keypair directly from secret key");
      } catch (keyError) {
        console.log("Direct keypair creation failed, using deterministic approach");
        
        try {
          // Use a deterministic approach for Web3Auth keys
          const encoder = new TextEncoder();
          const data = encoder.encode(privateKey);
          const hash = await crypto.subtle.digest('SHA-256', data);
          const seed = new Uint8Array(hash).slice(0, 32);
          keypair = Keypair.fromRawEd25519Seed(seed);
          console.log("Created keypair from hashed private key");
        } catch (seedError) {
          console.error("Failed to create keypair from seed:", seedError);
          throw new Error("Could not create a valid keypair: " + seedError.message);
        }
      }
      
      // Parse the XDR
      const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      
      // Sign with the keypair
      transaction.sign(keypair);
      
      // Get the server to submit the transaction
      const horizonUrl = GALERIE_CONFIG.STELLAR_NETWORK === "TESTNET"
        ? "https://horizon-testnet.stellar.org"
        : "https://horizon.stellar.org";
      const server = new StellarSdk.Horizon.Server(horizonUrl);
      
      // Submit the transaction
      const result = await server.submitTransaction(transaction);
      console.log("Transaction submitted successfully:", result);
      
      // Return the hash and signed XDR
      return {
        hash: result.hash,
        signedXDR: transaction.toXDR()
      };
    } catch (error) {
      console.error("Error signing transaction with Web3Auth:", error);
      
      if (error.response && error.response.data && error.response.data.extras) {
        const { result_codes } = error.response.data.extras;
        if (result_codes) {
          const errorDetails = JSON.stringify(result_codes);
          throw new Error(`Transaction failed: ${errorDetails}`);
        }
      }
      
      throw error;
    }
  };

  // Add a function to get the private key from IPFS or Web3Auth
  const getPrivateKey = async () => {
    try {
      // First try to get from localStorage (as primary fallback)
      const storedKey = localStorage.getItem('tempPrivateKey');
      if (storedKey) {
        console.log('Retrieved private key from localStorage');
        
        // If we have a publicKey, try to also store in IPFS for future use (if not already there)
        if (publicKey && isLoggedIn) {
          try {
            // Get user identifier
            let userIdentifier;
            if (web3Auth && web3Auth.connected) {
              try {
                const userInfo = await web3Auth.getUserInfo();
                userIdentifier = userInfo.email || userInfo.sub || publicKey;
              } catch (e) {
                userIdentifier = publicKey;
              }
            } else if (authType === 'traditional') {
              const currentUser = authService.getCurrentUser();
              userIdentifier = currentUser?.email || publicKey;
            } else {
              userIdentifier = publicKey;
            }
            
            // Check if already stored in IPFS to avoid redundant operations
            const walletRefs = JSON.parse(localStorage.getItem('walletRefs') || '{}');
            if (!walletRefs[publicKey]) {
              // Store the key in IPFS for future use
              await storeWalletData(publicKey, {
                privateKey: storedKey,
                publicKey,
                network: GALERIE_CONFIG.STELLAR_NETWORK,
                createdAt: new Date().toISOString(),
                source: 'localStorage_backup'
              }, userIdentifier);
              console.log('Stored localStorage key to IPFS for future use');
            }
          } catch (storageError) {
            console.warn('Could not sync localStorage key to IPFS:', storageError);
            // Non-fatal error, we can still use the localStorage key
          }
        }
        
        return storedKey;
      }
      
      // Then try to get from IPFS
      if (publicKey) {
        try {
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
            // Store in localStorage as backup for future use
            localStorage.setItem('tempPrivateKey', walletData.privateKey);
            return walletData.privateKey;
          }
        } catch (ipfsError) {
          console.warn('Error retrieving from IPFS, falling back to other methods:', ipfsError);
          // Continue to next method
        }
      }
      
      // Then try to get from Web3Auth if connected
      if (web3Auth && web3Auth.connected) {
        const provider = web3Auth.provider;
        if (provider) {
          try {
            console.log('Requesting private key from Web3Auth provider');
            const privateKey = await provider.request({ method: "private_key" });
            
            if (privateKey) {
              // Always store in localStorage for immediate use
              localStorage.setItem('tempPrivateKey', privateKey);
              console.log('Stored Web3Auth key in localStorage');
              
              // If we have a publicKey, try to also store in IPFS for future use
              if (publicKey) {
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
                  // Non-fatal error since we have localStorage backup
                }
              }
              
              return privateKey;
            }
          } catch (e) {
            console.error("Error getting private key from provider:", e);
          }
        }
      }
      
      throw new Error('No private key available from any source');
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
        getPrivateKey,
        signTransaction
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  return useContext(WalletContext);
}; 