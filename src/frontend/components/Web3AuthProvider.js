import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES } from '@web3auth/base';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { SolanaPrivateKeyProvider } from '@web3auth/solana-provider';

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

  // Initialization logic
  const initializeWeb3Auth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const privateKeyProvider = new SolanaPrivateKeyProvider({
        config: {
          chainConfig: {
            chainNamespace: CHAIN_NAMESPACES.SOLANA,
            chainId: "0x3",
            rpcTarget: "https://api.devnet.solana.com",
            displayName: "Solana Devnet",
            blockExplorer: "https://explorer.solana.com?cluster=devnet",
            ticker: "SOL",
            tickerName: "Solana",
          },
        },
      });

      const web3authInstance = new Web3Auth({
        clientId: process.env.REACT_APP_WEB3AUTH_CLIENT_ID,
        web3AuthNetwork: "sapphire_devnet",
        privateKeyProvider,
      });

      const openloginAdapter = new OpenloginAdapter({
        adapterSettings: {
          clientId: process.env.REACT_APP_WEB3AUTH_CLIENT_ID,
          network: "testnet",
          uxMode: "popup",
          whiteLabel: {
            name: "NFT Marketplace",
            logoLight: "https://web3auth.io/images/web3auth-logo.svg",
            logoDark: "https://web3auth.io/images/web3auth-logo.svg",
            defaultLanguage: "en",
            dark: true,
          },
        },
      });

      web3authInstance.configureAdapter(openloginAdapter);
      await web3authInstance.initModal();
      setWeb3auth(web3authInstance);

      // Check if user is already logged in
      if (web3authInstance.connected) {
        const user = await web3authInstance.getUserInfo();
        setPublicKey(user.email || user.name);
        setIsConnected(true);
      }
      setReady(true);
    } catch (err) {
      console.error('Web3Auth initialization error:', err);
      setError('Failed to initialize Web3Auth');
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeWeb3Auth();
  }, [initializeWeb3Auth]);

  // Login function
  const login = async () => {
    if (!ready || !web3auth) {
      setError('Web3Auth is not ready. Please wait or retry.');
      return;
    }
    try {
      setLoading(true);
      const web3authProvider = await web3auth.connect();
      const user = await web3auth.getUserInfo();
      setPublicKey(user.email || user.name);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to login with Web3Auth');
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      if (web3auth) {
        await web3auth.logout();
      }
      setPublicKey(null);
      setIsConnected(false);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout from Web3Auth');
    }
  };

  const value = {
    publicKey,
    isConnected,
    error,
    loading,
    ready,
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