import React, { createContext, useState, useEffect, useContext } from 'react';
import Web3Auth from '@web3auth/web3auth';
import OpenloginAdapter from '@web3auth/openlogin-adapter';

const Web3AuthContext = createContext();

export function useWeb3Auth() {
  const context = useContext(Web3AuthContext);
  if (!context) {
    throw new Error('useWeb3Auth must be used within a Web3AuthProvider');
  }
  return context;
}

export const Web3AuthProvider = ({ children }) => {
  const [web3Auth, setWeb3Auth] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('[DEBUG] Web3AuthProvider mounted');
    initializeWeb3Auth();
  }, []);

  const initializeWeb3Auth = async () => {
    try {
      console.log('[DEBUG] Initializing Web3Auth...');
      const web3auth = new Web3Auth({
        clientId: process.env.REACT_APP_WEB3AUTH_CLIENT_ID,
        chainConfig: {
          chainNamespace: "other",
        },
        web3AuthNetwork: "testnet",
      });

      const openloginAdapter = new OpenloginAdapter({
        adapterSettings: {
          clientId: process.env.REACT_APP_WEB3AUTH_CLIENT_ID,
          network: "testnet",
          uxMode: "popup",
        },
      });

      web3auth.configureAdapter(openloginAdapter);
      await web3auth.initModal();
      setWeb3Auth(web3auth);
      console.log('[DEBUG] Web3Auth initialized successfully');
    } catch (error) {
      console.error('[DEBUG] Error initializing Web3Auth:', error);
      setError(error.message);
    }
  };

  const login = async () => {
    try {
      console.log('[DEBUG] Starting Web3Auth login...');
      if (!web3Auth) {
        throw new Error('Web3Auth not initialized');
      }

      const web3authProvider = await web3Auth.connect();
      console.log('[DEBUG] Web3Auth connected successfully');
      
      const userInfo = await web3Auth.getUserInfo();
      console.log('[DEBUG] Web3Auth user info:', userInfo);
      
      setIsConnected(true);
      setUserInfo(userInfo);
      console.log('[DEBUG] Web3Auth login completed successfully');
    } catch (error) {
      console.error('[DEBUG] Error during Web3Auth login:', error);
      setError(error.message);
    }
  };

  const logout = async () => {
    try {
      console.log('[DEBUG] Starting Web3Auth logout...');
      if (!web3Auth) {
        throw new Error('Web3Auth not initialized');
      }

      await web3Auth.logout();
      setIsConnected(false);
      setUserInfo(null);
      console.log('[DEBUG] Web3Auth logout completed successfully');
    } catch (error) {
      console.error('[DEBUG] Error during Web3Auth logout:', error);
      setError(error.message);
    }
  };

  const value = {
    isConnected,
    isWeb3AuthConnected: isConnected,
    userInfo,
    error,
    login,
    logout
  };

  return (
    <Web3AuthContext.Provider value={value}>
      {children}
    </Web3AuthContext.Provider>
  );
}; 