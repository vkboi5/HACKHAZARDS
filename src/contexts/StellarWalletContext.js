import React, { createContext, useState, useContext, useEffect } from 'react';
import { Wallet } from '@stellar/wallet-sdk';
import stellarService from '../services/stellarService';

const StellarWalletContext = createContext();

export const StellarWalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize wallet
  const initializeWallet = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Create a new wallet instance
      const newWallet = new Wallet();
      setWallet(newWallet);
      
      // Check if there's a saved public key
      const savedPublicKey = localStorage.getItem('stellarPublicKey');
      if (savedPublicKey) {
        await connectWallet(savedPublicKey);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error initializing wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  // Connect wallet
  const connectWallet = async (publicKey) => {
    try {
      setLoading(true);
      setError(null);
      
      // Load account details
      const account = await stellarService.getAccount(publicKey);
      setPublicKey(publicKey);
      setBalance(account.balances);
      setIsConnected(true);
      
      // Save public key to localStorage
      localStorage.setItem('stellarPublicKey', publicKey);
    } catch (err) {
      setError(err.message);
      console.error('Error connecting wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWallet(null);
    setPublicKey(null);
    setIsConnected(false);
    setBalance(null);
    localStorage.removeItem('stellarPublicKey');
  };

  // Create new account
  const createNewAccount = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { publicKey, secretKey } = await stellarService.createAccount();
      await connectWallet(publicKey);
      
      // In a real application, you would want to securely store the secret key
      // This is just for demonstration purposes
      localStorage.setItem('stellarSecretKey', secretKey);
      
      return { publicKey, secretKey };
    } catch (err) {
      setError(err.message);
      console.error('Error creating account:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get NFT balance
  const getNFTBalance = async (assetCode) => {
    try {
      if (!publicKey) throw new Error('Wallet not connected');
      return await stellarService.getNFTBalance(publicKey, assetCode);
    } catch (err) {
      setError(err.message);
      console.error('Error getting NFT balance:', err);
      throw err;
    }
  };

  // Transfer NFT
  const transferNFT = async (toPublicKey, assetCode, amount) => {
    try {
      if (!publicKey) throw new Error('Wallet not connected');
      const secretKey = localStorage.getItem('stellarSecretKey');
      if (!secretKey) throw new Error('Secret key not found');
      
      return await stellarService.transferNFT(secretKey, toPublicKey, assetCode, amount);
    } catch (err) {
      setError(err.message);
      console.error('Error transferring NFT:', err);
      throw err;
    }
  };

  // Effect to initialize wallet on mount
  useEffect(() => {
    initializeWallet();
  }, []);

  const value = {
    wallet,
    publicKey,
    isConnected,
    balance,
    loading,
    error,
    connectWallet,
    disconnectWallet,
    createNewAccount,
    getNFTBalance,
    transferNFT
  };

  return (
    <StellarWalletContext.Provider value={value}>
      {children}
    </StellarWalletContext.Provider>
  );
};

export const useStellarWallet = () => {
  const context = useContext(StellarWalletContext);
  if (!context) {
    throw new Error('useStellarWallet must be used within a StellarWalletProvider');
  }
  return context;
};

export default StellarWalletContext; 