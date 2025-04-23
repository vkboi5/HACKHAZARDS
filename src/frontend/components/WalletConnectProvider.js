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

      // Log the transaction details for debugging
      console.log('Signing transaction:', {
        xdr,
        publicKey,
        walletMethod,
        networkPassphrase: getNetworkConfig().networkPassphrase
      });

      // Check if we need to reconnect
      if (!isConnected || !publicKey) {
        console.log('WalletConnect session disconnected, attempting to reconnect...');
        try {
          await kit.openModal({
            onWalletSelected: async (option) => {
              try {
                kit.setWallet(option.id);
                const { address } = await kit.getAddress();
                if (address) {
                  setPublicKey(address);
                  setIsConnected(true);
                  setWalletMethod(option.id);
                  localStorage.setItem('stellarPublicKey', address);
                  localStorage.setItem('stellarWalletMethod', option.id);
                }
              } catch (err) {
                console.error('Reconnection error:', err);
                throw new Error('Failed to reconnect wallet');
              }
            },
            onClosed: () => {
              throw new Error('Wallet connection cancelled');
            }
          });
        } catch (err) {
          console.error('Reconnection attempt failed:', err);
          throw new Error('Failed to reconnect wallet. Please try connecting again.');
        }
      }

      // For LOBSTR wallet, we need to ensure the transaction is properly formatted
      if (walletMethod === LOBSTR_ID) {
        try {
          // Parse the XDR to ensure it's valid
          const transaction = StellarSdk.TransactionBuilder.fromXDR(
            xdr,
            getNetworkConfig().networkPassphrase
          );

          // Rebuild the transaction to ensure proper formatting
          const rebuiltXdr = transaction.toXDR();
          
          const { signedTxXdr } = await kit.signTransaction(rebuiltXdr, {
            networkPassphrase: getNetworkConfig().networkPassphrase
          });

          if (!signedTxXdr) {
            throw new Error('No signed transaction received from wallet');
          }

          return { signedXDR: signedTxXdr };
        } catch (parseError) {
          console.error('Error parsing transaction:', parseError);
          throw new Error('Invalid transaction format. Please try again.');
        }
      } else {
        // For other wallets, use the standard signing process
        const { signedTxXdr } = await kit.signTransaction(xdr, {
          networkPassphrase: getNetworkConfig().networkPassphrase
        });

        if (!signedTxXdr) {
          throw new Error('No signed transaction received from wallet');
        }

        return { signedXDR: signedTxXdr };
      }
    } catch (err) {
      console.error('Transaction signing error:', err);
      // Provide more specific error messages
      if (err.message.includes('User rejected')) {
        throw new Error('Transaction signing was cancelled by the user.');
      } else if (err.message.includes('Invalid transaction')) {
        throw new Error('Invalid transaction format. Please try again.');
      } else if (err.message.includes('connection key is missing') || err.message.includes('Failed to reconnect')) {
        // Force reconnection if connection is lost
        setIsConnected(false);
        setPublicKey(null);
        localStorage.removeItem('stellarPublicKey');
        localStorage.removeItem('stellarWalletMethod');
        throw new Error('Wallet connection lost. Please reconnect your wallet and try again.');
      } else {
        throw new Error(`Failed to sign transaction: ${err.message}`);
      }
    }
  };

  // Sign and submit transaction
  const signAndSubmitTransaction = async (xdr) => {
    try {
      if (!isConnected || !kit) {
        throw new Error('Wallet not connected');
      }

      // First sign the transaction
      const { signedXDR } = await signTransaction(xdr);
      
      if (!signedXDR) {
        throw new Error('Failed to sign transaction - no signed XDR returned');
      }

      console.log('Successfully signed transaction, preparing to submit...');

      try {
        // Parse the signed transaction
        const transaction = StellarSdk.TransactionBuilder.fromXDR(
          signedXDR,
          getNetworkConfig().networkPassphrase
        );

        // Submit the transaction
        console.log('Submitting transaction to the Stellar network...');
        const result = await server.submitTransaction(transaction);
        console.log('Transaction submitted successfully:', result.hash);
        return { hash: result.hash };
      } catch (submitError) {
        console.error('Transaction submission error:', submitError);
        
        // Extract more detailed error information
        if (submitError.response && submitError.response.data) {
          const { extras } = submitError.response.data;
          if (extras && extras.result_codes) {
            const { transaction: txCode, operations } = extras.result_codes;
            console.error('Transaction result code:', txCode);
            console.error('Operation result codes:', operations);
            
            let errorMsg = `Transaction failed: ${txCode}`;
            if (operations && operations.length > 0) {
              errorMsg += ` - Operations: [${operations.join(', ')}]`;
            }
            
            throw new Error(errorMsg);
          }
        }
        
        // If we couldn't extract detailed info, rethrow the original error
        throw submitError;
      }
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