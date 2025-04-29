import React from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { useWalletConnect } from './WalletConnectProvider'; 
import { useWeb3Auth } from './Web3AuthProvider';
import { Badge } from 'react-bootstrap';
import { FaWallet, FaUserCircle } from 'react-icons/fa';

const WalletStatusIndicator = () => {
  // Get state from all wallet providers
  const { 
    isLoggedIn: isWalletContextLoggedIn, 
    publicKey: walletContextKey, 
    authType
  } = useWallet();
  
  const { 
    isConnected: isWalletConnected, 
    publicKey: walletConnectKey,
    walletMethod 
  } = useWalletConnect();

  const {
    isConnected: isWeb3AuthConnected,
    publicKey: web3AuthKey
  } = useWeb3Auth();
  
  // Determine connection status - include web3AuthConnected state
  const isConnected = isWalletContextLoggedIn || isWalletConnected || isWeb3AuthConnected;
  const publicKey = walletContextKey || walletConnectKey || web3AuthKey;
  
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
  React.useEffect(() => {
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
          <small className="text-muted">{formatPublicKey(publicKey)}</small>
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