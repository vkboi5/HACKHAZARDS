import React, { createContext, useContext, useState, useEffect } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  LOBSTR_ID,
  ISupportedWallet,
} from '@creit.tech/stellar-wallets-kit';
import {
  WalletConnectAllowedMethods,
  WalletConnectModule,
} from '@creit.tech/stellar-wallets-kit/modules/walletconnect.module';
import './WalletConnect.css';

// Create a context for the wallet
const WalletConnectContext = createContext();

// Custom hook to use the wallet context
export function useWalletConnect() {
  return useContext(WalletConnectContext);
}

export function WalletConnectProvider({ children }) {
  const [kit, setKit] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [server, setServer] = useState(null);
  const [balanceInXLM, setBalanceInXLM] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [walletMethod, setWalletMethod] = useState('');

  // Network type detection and configuration
  const getNetworkConfig = () => {
    const isTestnet = !process.env.REACT_APP_USE_MAINNET || process.env.REACT_APP_USE_MAINNET.toLowerCase() !== 'true';
    return {
      networkUrl: isTestnet 
        ? (process.env.REACT_APP_HORIZON_TESTNET_URL || 'https://horizon-testnet.stellar.org')
        : (process.env.REACT_APP_HORIZON_MAINNET_URL || 'https://horizon.stellar.org'),
      networkPassphrase: isTestnet
        ? 'Test SDF Network ; September 2015'
        : 'Public Global Stellar Network ; September 2015',
      networkName: isTestnet ? 'TESTNET' : 'PUBLIC',
      network: isTestnet ? WalletNetwork.TESTNET : WalletNetwork.PUBLIC
    };
  };

  // Initialize the Stellar server and WalletKit
  useEffect(() => {
    async function initialize() {
      try {
        const networkConfig = getNetworkConfig();
        console.log(`Initializing Stellar server with ${networkConfig.networkUrl} (${networkConfig.networkName})`);
        
        const stellarServer = new StellarSdk.Horizon.Server(networkConfig.networkUrl);
        setServer(stellarServer);

        // Initialize StellarWalletsKit with WalletConnect
        const walletKit = new StellarWalletsKit({
          network: networkConfig.network,
          selectedWalletId: LOBSTR_ID,
          modules: [
            ...allowAllModules(),
            new WalletConnectModule({
              projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID,
              name: 'Galerie',
              description: 'Galerie - NFT Marketplace',
              url: window.location.origin,
              icons: [`${window.location.origin}/logo192.png`],
              method: WalletConnectAllowedMethods.SIGN,
              network: networkConfig.network,
            }),
          ],
        });

        setKit(walletKit);

        // Check for stored wallet connection
        const storedPublicKey = localStorage.getItem('stellarPublicKey');
        const storedWalletMethod = localStorage.getItem('stellarWalletMethod');
        
        if (storedPublicKey && storedWalletMethod) {
          setPublicKey(storedPublicKey);
          setWalletMethod(storedWalletMethod);
          setIsConnected(true);
          loadAccountBalance(storedPublicKey, stellarServer);
        }
        
        setIsInitializing(false);
      } catch (err) {
        console.error('Initialization error:', err);
        setError(`Failed to initialize wallet: ${err.message}`);
        setIsInitializing(false);
      }
    }
    
    initialize();
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

  // Connect to a wallet using the built-in UI modal
  const connectWallet = async () => {
    try {
      if (!kit) {
        throw new Error('WalletKit not initialized');
      }

      await kit.openModal({
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            
            if (address) {
              setPublicKey(address);
              setIsConnected(true);
              setWalletMethod(option.id);
              
              // Store connection details
              localStorage.setItem('stellarPublicKey', address);
              localStorage.setItem('stellarWalletMethod', option.id);
              
              // Load account balance
              loadAccountBalance(address, server);
              setError(null);
            }
          } catch (err) {
            console.error('Wallet connection error:', err);
            setError(`Failed to connect with wallet: ${err.message}`);
          }
        },
        onClosed: (err) => {
          if (err) {
            console.error('Modal closed with error:', err);
            setError(err.message);
          }
        },
        modalTitle: 'Connect your Stellar Wallet',
        notAvailableText: 'Not installed/available',
      });
    } catch (err) {
      console.error('Connect wallet error:', err);
      setError(`Failed to connect wallet: ${err.message}`);
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      if (kit) {
        await kit.disconnect();
      }
      
      setPublicKey(null);
      setIsConnected(false);
      setWalletMethod('');
      setBalanceInXLM(0);
      localStorage.removeItem('stellarPublicKey');
      localStorage.removeItem('stellarWalletMethod');
    } catch (err) {
      console.error('Disconnect error:', err);
      setError(`Failed to disconnect: ${err.message}`);
    }
  };

  // Sign transaction
  const signTransaction = async (xdr) => {
    try {
      if (!isConnected || !kit) {
        throw new Error('Wallet not connected');
      }

      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address: publicKey,
        networkPassphrase: getNetworkConfig().networkPassphrase
      });

      return { signedXDR: signedTxXdr };
    } catch (err) {
      console.error('Transaction signing error:', err);
      throw err;
    }
  };

  // Sign and submit transaction
  const signAndSubmitTransaction = async (xdr) => {
    try {
      if (!isConnected || !kit) {
        throw new Error('Wallet not connected');
      }

      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address: publicKey,
        networkPassphrase: getNetworkConfig().networkPassphrase
      });

      // Submit the signed transaction
      const transaction = StellarSdk.TransactionBuilder.fromXDR(
        signedTxXdr,
        getNetworkConfig().networkPassphrase
      );

      const result = await server.submitTransaction(transaction);
      return { hash: result.hash };
    } catch (err) {
      console.error('Transaction signing and submission error:', err);
      throw err;
    }
  };

  // Get account details
  const getAccountDetails = async (accountAddress = null) => {
    try {
      const address = accountAddress || publicKey;
      if (!address) {
        throw new Error('No public key available');
      }
      
      const account = await server.loadAccount(address);
      return account;
    } catch (err) {
      console.error('Error getting account details:', err);
      throw err;
    }
  };

  // Value object for the context
  const value = {
    publicKey,
    isConnected,
    error,
    isInitializing,
    connectWallet,
    disconnectWallet,
    signTransaction,
    signAndSubmitTransaction,
    getAccountDetails,
    balanceInXLM,
    walletMethod
  };

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
    </WalletConnectContext.Provider>
  );
} 