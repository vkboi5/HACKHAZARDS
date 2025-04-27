import React, { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { StellarWalletsKit, WalletNetwork } from '@creit.tech/stellar-wallets-kit';
import { Keypair, Networks } from '@stellar/stellar-sdk';

const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
  const [web3Auth, setWeb3Auth] = useState(null);
  const [stellarKit, setStellarKit] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const initWeb3Auth = async () => {
      try {
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

        // Initialize Stellar Wallets Kit
        const kit = new StellarWalletsKit({
          network: WalletNetwork.TESTNET,
          selectedWallet: 'FREIGHTER',
        });
        setStellarKit(kit);
      } catch (error) {
        console.error("Error initializing Web3Auth:", error);
      }
    };

    initWeb3Auth();
  }, []);

  const login = async () => {
    try {
      if (!web3Auth) return;
      
      const web3authProvider = await web3Auth.connect();
      const privateKey = await web3authProvider.request({ method: "private_key" });
      
      // Generate Stellar keypair from private key
      const keypair = Keypair.fromSecret(privateKey);
      setPublicKey(keypair.publicKey());
      
      // Store keys securely
      localStorage.setItem('stellar_public_key', keypair.publicKey());
      localStorage.setItem('stellar_private_key', privateKey);
      
      setIsLoggedIn(true);
    } catch (error) {
      console.error("Error during login:", error);
    }
  };

  const logout = async () => {
    try {
      if (web3Auth) {
        await web3Auth.logout();
        localStorage.removeItem('stellar_public_key');
        localStorage.removeItem('stellar_private_key');
        setPublicKey(null);
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const buyWithMoonpay = async (nftId, amount) => {
    try {
      if (!publicKey) throw new Error("User not logged in");
      
      // Initialize Moonpay
      const moonpay = new window.MoonPay({
        apiKey: process.env.REACT_APP_MOONPAY_API_KEY,
        environment: 'sandbox', // or 'production'
      });

      // Open Moonpay widget
      moonpay.show({
        currencyCode: 'XLM',
        baseCurrencyAmount: amount,
        walletAddress: publicKey,
        onPaymentCompleted: async (data) => {
          // Handle successful payment
          console.log('Payment completed:', data);
          // Here you would typically call your backend to mint/transfer the NFT
        },
      });
    } catch (error) {
      console.error("Error in Moonpay checkout:", error);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        isLoggedIn,
        publicKey,
        login,
        logout,
        buyWithMoonpay,
        stellarKit,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}; 