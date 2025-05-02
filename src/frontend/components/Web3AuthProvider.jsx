import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES } from '@web3auth/base';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { SolanaPrivateKeyProvider } from '@web3auth/solana-provider';
import * as StellarSdk from '@stellar/stellar-sdk';

// Create a context for Web3Auth
const Web3AuthContext = createContext();

// Custom hook to use the Web3Auth context
export function useWeb3Auth() {
  return useContext(Web3AuthContext);
}

export function Web3AuthProvider({ children }) {
  const [web3auth, setWeb3auth] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  // Use a ref to track initialization state
  const isInitializing = useRef(false);
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;

  // Helper function to check if error is related to rate limiting
  const isRateLimitError = (error) => {
    if (!error) return false;
    const errorMessage = typeof error === 'string' ? error : error.message || '';
    return errorMessage.includes('429') || 
           errorMessage.includes('Too Many Requests') || 
           errorMessage.includes('failed to fetch');
  };

  // Helper function to derive Stellar keypair and address from private key
  const deriveStellarPublicKey = async (privateKey) => {
    try {
      // For Solana private key, convert to a format usable by Stellar
      const encoder = new TextEncoder();
      const data = encoder.encode(privateKey);
      const hash = await crypto.subtle.digest('SHA-256', data);
      const seed = new Uint8Array(hash).slice(0, 32);
      
      // Create Stellar keypair
      const keypair = StellarSdk.Keypair.fromRawEd25519Seed(seed);
      return keypair.publicKey();
    } catch (err) {
      console.error("Error deriving Stellar public key:", err);
      return null;
    }
  };

  // Initialization logic
  const initializeWeb3Auth = useCallback(async () => {
    // Skip if already initializing or we've reached max retries
    if (isInitializing.current) {
      console.log("Web3Auth initialization already in progress, skipping");
      return;
    }
    
    if (retryCount.current >= MAX_RETRIES) {
      console.error(`Maximum retry attempts (${MAX_RETRIES}) reached for Web3Auth initialization`);
      setError(`Failed to initialize Web3Auth after ${MAX_RETRIES} attempts. Please try again later.`);
      setLoading(false);
      return;
    }
    
    isInitializing.current = true;
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Initializing Web3Auth (attempt ${retryCount.current + 1})`);
      
      // Create private key provider
      const privateKeyProvider = new SolanaPrivateKeyProvider({
        config: {
          chainConfig: {
            chainNamespace: CHAIN_NAMESPACES.SOLANA,
            chainId: "0x3", // Solana devnet chainId
            rpcTarget: "https://api.devnet.solana.com",
            displayName: "Solana Devnet",
            blockExplorer: "https://explorer.solana.com?cluster=devnet",
            ticker: "SOL",
            tickerName: "Solana",
          },
        },
      });

      // Initialize Web3Auth - make sure clientId is properly set in your .env file
      const web3authInstance = new Web3Auth({
        clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID || "",
        web3AuthNetwork: "sapphire_devnet",
        privateKeyProvider,
        uiConfig: {
          appName: "NFT Marketplace",
          appLogo: "https://web3auth.io/images/web3auth-logo.svg",
          theme: "dark",
          loginMethodsOrder: ["google", "facebook", "twitter", "email_passwordless"]
        }
      });

      // Create and configure OpenloginAdapter
      const openloginAdapter = new OpenloginAdapter({
        loginSettings: {
          mfaLevel: "none"
        },
        adapterSettings: {
          clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID || "",
          network: "testnet",
          uxMode: "popup",
        }
      });

      // Add adapter to Web3Auth instance
      web3authInstance.configureAdapter(openloginAdapter);
      
      // Initialize Web3Auth modal with timeout
      try {
        const initPromise = web3authInstance.initModal();
        
        // Add a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Web3Auth initialization timed out")), 15000);
        });
        
        await Promise.race([initPromise, timeoutPromise]);
        setWeb3auth(web3authInstance);
      } catch (modalError) {
        console.error("Error initializing Web3Auth modal:", modalError);
        
        // If we get a rate limit error (429), backoff exponentially
        if (modalError.message && (
            modalError.message.includes("429") || 
            modalError.message.includes("Too Many Requests") ||
            modalError.message.includes("failed to fetch")
        )) {
          setIsRateLimited(true);
          const backoffTime = Math.pow(2, retryCount.current) * 2000; // Exponential backoff
          console.log(`Rate limited. Retrying in ${backoffTime/1000} seconds...`);
          retryCount.current++;
          
          setTimeout(() => {
            isInitializing.current = false;
            initializeWeb3Auth();
          }, backoffTime);
          return;
        } else {
          throw modalError; // Re-throw other errors
        }
      }

      // Check if user is already logged in
      if (web3authInstance.connected) {
        console.log("Web3Auth instance is already connected");
        try {
          const user = await web3authInstance.getUserInfo();
          console.log("Web3Auth user info:", user);
          
          // Get private key and derive Stellar public key
          const provider = web3authInstance.provider;
          if (provider) {
            try {
              const privateKey = await provider.request({ method: "private_key" });
              if (privateKey) {
                // Derive and set the actual Stellar wallet address
                const stellarPublicKey = await deriveStellarPublicKey(privateKey);
                if (stellarPublicKey) {
                  setPublicKey(stellarPublicKey);
                  setIsConnected(true);
                  
                  // Dispatch event for wallet context
                  window.dispatchEvent(new CustomEvent('web3AuthLogin', { 
                    detail: { privateKey, user, publicKey: stellarPublicKey }
                  }));
                } else {
                  console.error("Failed to derive Stellar public key on init");
                  setPublicKey(null);
                  setIsConnected(false);
                }
              }
            } catch (pkError) {
              console.error("Error getting private key during init:", pkError);
            }
          }
        } catch (userInfoError) {
          console.error("Error getting user info during init:", userInfoError);
        }
      } else {
        console.log("Web3Auth instance is not connected");
        setIsConnected(false);
      }
      
      setReady(true);
      retryCount.current = 0; // Reset retry count on success
    } catch (err) {
      console.error('Web3Auth initialization error:', err);
      
      // Check if this is a rate limit error
      if (isRateLimitError(err)) {
        setIsRateLimited(true);
        setError('Web3Auth is currently rate limited. Please try again later or use an alternative login method.');
      } else {
        setError('Failed to initialize Web3Auth: ' + (err.message || err));
      }
      
      setReady(false);
      
      // Increment retry count for all errors
      retryCount.current++;
    } finally {
      setLoading(false);
      isInitializing.current = false;
    }
  }, []);

  useEffect(() => {
    // Only initialize on component mount
    if (!web3auth) {
      initializeWeb3Auth();
    }
    
    // If already connected, ensure we dispatch a custom event to notify WalletContext
    if (web3auth && web3auth.connected && publicKey) {
      try {
        console.log("Already connected, dispatching web3AuthLogin event for wallet sync");
        const provider = web3auth.provider;
        if (provider) {
          provider.request({ method: "private_key" })
            .then(privateKey => {
              if (privateKey) {
                window.dispatchEvent(new CustomEvent('web3AuthLogin', { 
                  detail: { privateKey, publicKey: publicKey }
                }));
              }
            })
            .catch(err => console.error("Error getting private key for sync:", err));
        }
      } catch (e) {
        console.error("Error dispatching sync event:", e);
      }
    }
    
    // Check connection status on focus
    const handleFocus = () => {
      if (web3auth && web3auth.connected && !isConnected) {
        setIsConnected(true);
        
        // Get private key and derive Stellar public key on window focus
        if (web3auth.provider) {
          web3auth.provider.request({ method: "private_key" })
            .then(async (privateKey) => {
              if (privateKey) {
                const stellarPublicKey = await deriveStellarPublicKey(privateKey);
                if (stellarPublicKey) {
                  setPublicKey(stellarPublicKey);
                  // Dispatch event to synchronize wallet context
                  window.dispatchEvent(new CustomEvent('web3AuthLogin', { 
                    detail: { privateKey, publicKey: stellarPublicKey }
                  }));
                }
              }
            })
            .catch(err => {
              console.error("Error getting private key on focus:", err);
            });
        }
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [initializeWeb3Auth, web3auth, isConnected, publicKey]);

  // Login function
  const login = async () => {
    if (!ready || !web3auth) {
      if (isRateLimited) {
        setError('Web3Auth is currently rate limited. Please try again later or use an alternative login method.');
        return { success: false, error: 'Web3Auth rate limited', isRateLimited: true };
      } else {
        setError('Web3Auth is not ready. Please wait or retry initialization.');
        return { success: false, error: 'Web3Auth is not ready' };
      }
    }
    try {
      setLoading(true);
      
      // Add timeout for connection
      const connectPromise = web3auth.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Connection timed out")), 30000);
      });
      
      const web3authProvider = await Promise.race([connectPromise, timeoutPromise]);
      
      // Get user info for display
      const user = await web3auth.getUserInfo();
      console.log("Web3Auth login successful, user info:", user);
      
      // Get the private key - this is crucial for Stellar wallet creation
      let privateKey;
      try {
        // For Solana adapter
        privateKey = await web3authProvider.request({ method: "private_key" });
        
        // Log key details for debugging (without revealing the actual key)
        console.log("Private key retrieved:",
          privateKey ? {
            type: typeof privateKey,
            length: privateKey.length,
            prefix: privateKey.substring(0, 5) + '...'
          } : 'null or undefined');
          
        if (!privateKey) {
          throw new Error("Private key is empty");
        }
        
        // Store the private key for wallet creation
        localStorage.setItem('tempPrivateKey', privateKey);
        console.log("Private key stored in temporary storage");
        
        // Derive the Stellar public key from the private key
        const stellarPublicKey = await deriveStellarPublicKey(privateKey);
        if (stellarPublicKey) {
          setPublicKey(stellarPublicKey);
          console.log("Derived Stellar public key:", stellarPublicKey);
        } else {
          console.error("Failed to derive Stellar public key");
          setPublicKey(null);
        }
      } catch (pkError) {
        console.error("Error getting private key:", pkError);
        throw new Error("Failed to get private key: " + pkError.message);
      }
      
      // Set connection status
      setIsConnected(true);
      setError(null);
      
      // Dispatch a custom event to notify WalletContext with both keys
      window.dispatchEvent(new CustomEvent('web3AuthLogin', { 
        detail: { privateKey, user, publicKey }
      }));
      
      return { success: true, user, publicKey };
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to login with Web3Auth: ' + (err.message || err));
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      if (web3auth) {
        await web3auth.logout();
        console.log("Web3Auth logout successful");
      }
      setPublicKey(null);
      setIsConnected(false);
      setError(null);
      
      // Clear any stored keys
      localStorage.removeItem('tempPrivateKey');
      
      return { success: true };
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout from Web3Auth: ' + (err.message || err));
      return { success: false, error: err.message };
    }
  };

  const value = {
    publicKey,
    isConnected,
    error,
    loading,
    ready,
    isRateLimited,
    login,
    logout,
    retryInit: initializeWeb3Auth
  };

  return (
    <Web3AuthContext.Provider value={value}>
      {children}
    </Web3AuthContext.Provider>
  );
} 