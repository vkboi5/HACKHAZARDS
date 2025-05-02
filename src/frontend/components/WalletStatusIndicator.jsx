import React, { useState, useEffect } from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { useWalletConnect } from './WalletConnectProvider'; 
import { useWeb3Auth } from './Web3AuthProvider';
import { Badge } from 'react-bootstrap';
import { FaWallet, FaUserCircle, FaCoins } from 'react-icons/fa';
import useUnifiedWallet from '../../hooks/useUnifiedWallet';

const WalletStatusIndicator = () => {
  // Get state from all wallet providers
  const { 
    isLoggedIn: isWalletContextLoggedIn, 
    publicKey: walletContextKey, 
    authType,
    walletBalance: web3AuthBalance
  } = useWallet();
  
  const { 
    isConnected: isWalletConnected, 
    publicKey: walletConnectKey,
    walletMethod,
    balanceInXLM
  } = useWalletConnect();

  const {
    isConnected: isWeb3AuthConnected,
    publicKey: web3AuthKey
  } = useWeb3Auth();
  
  const { walletBalance } = useUnifiedWallet();
  const [formattedBalance, setFormattedBalance] = useState('0.00');
  
  // Determine connection status - include web3AuthConnected state
  const isConnected = isWalletContextLoggedIn || isWalletConnected || isWeb3AuthConnected;
  const publicKey = walletContextKey || walletConnectKey || web3AuthKey;
  
  // Update balance when it changes
  useEffect(() => {
    // Format balance based on which wallet is connected
    if (walletBalance?.xlm) {
      setFormattedBalance(parseFloat(walletBalance.xlm).toFixed(2));
    } else if (balanceInXLM) {
      setFormattedBalance(parseFloat(balanceInXLM).toFixed(2));
    } else if (web3AuthBalance?.xlm) {
      setFormattedBalance(parseFloat(web3AuthBalance.xlm).toFixed(2));
    } else {
      setFormattedBalance('0.00');
    }
  }, [walletBalance, balanceInXLM, web3AuthBalance]);
  
  // Determine connection type
  const getConnectionType = () => {
    if (isWeb3AuthConnected) {
      return 'Web3Auth';
    } else if (isWalletContextLoggedIn) {
      return authType === 'web3auth' ? 'Web3Auth' : 'Email Login';
    } else if (isWalletConnected) {
      return walletMethod || 'WalletConnect';
    }
    return 'Not Connected';
  };
  
  const formatPublicKey = (key) => {
    if (!key) return 'No public key available';
    if (typeof key !== 'string') {
      console.warn('Unexpected publicKey format:', key);
      return 'Invalid key format';
    }
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  // For debugging
  useEffect(() => {
    if (isConnected) {
      console.log('WalletStatusIndicator - Connected with key:', publicKey);
    }
  }, [isConnected, publicKey]);

  return (
    <div className="wallet-status-indicator d-flex align-items-center">
      {isConnected ? (
        <>
          <Badge bg="success" className="me-2">
            <FaWallet className="me-1" /> {getConnectionType()}
          </Badge>
          <small className="text-muted">
            <FaCoins className="me-1" />{formattedBalance} XLM
          </small>
        </>
      ) : (
        <Badge bg="secondary">
          <FaUserCircle className="me-1" /> Not Connected
        </Badge>
      )}
    </div>
  );
};

export default WalletStatusIndicator; 