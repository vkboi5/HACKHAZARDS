import { useWallet } from '../contexts/WalletContext';
import { useWalletConnect } from '../frontend/components/WalletConnectProvider';
import { useWeb3Auth } from '../frontend/components/Web3AuthProvider';

/**
 * Custom hook that unifies all wallet interfaces (Web3Auth, WalletConnect, and direct Web3Auth)
 * to provide a single, consistent interface for interacting with any connected wallet
 */
const useUnifiedWallet = () => {
  // Get state from all wallet providers
  const { 
    isLoggedIn: isWeb3AuthLoggedIn, 
    publicKey: web3AuthKey, 
    walletBalance: web3AuthBalance,
    authType,
    buyWithMoonpay,
    getPrivateKey,
    logout: logoutWeb3Auth
  } = useWallet();
  
  const { 
    isConnected: isWalletConnected, 
    publicKey: walletConnectKey,
    walletMethod,
    balanceInXLM,
    signAndSubmitTransaction,
    disconnectWallet
  } = useWalletConnect();
  
  // Direct access to Web3Auth provider
  const {
    isConnected: isWeb3AuthDirectConnected,
    publicKey: web3AuthDirectKey
  } = useWeb3Auth();

  // Combined connection state that includes direct Web3Auth connection
  const isConnected = isWeb3AuthLoggedIn || isWalletConnected || isWeb3AuthDirectConnected;
  const publicKey = web3AuthKey || walletConnectKey || web3AuthDirectKey;
  
  // Combined balance (use the appropriate one based on which wallet is connected)
  const walletBalance = isWeb3AuthLoggedIn && web3AuthBalance 
    ? web3AuthBalance 
    : (isWalletConnected ? { xlm: balanceInXLM } : null);
    
  // Unified logout function that works with either wallet
  const logout = async () => {
    if (isWeb3AuthLoggedIn) {
      await logoutWeb3Auth();
    } else if (isWalletConnected) {
      await disconnectWallet();
    }
  };
  
  // Determine connection type in a readable format
  const connectionType = isWeb3AuthLoggedIn 
    ? (authType === 'web3auth' ? 'Web3Auth' : 'Email') 
    : (isWalletConnected ? (walletMethod || 'WalletConnect') : 
       (isWeb3AuthDirectConnected ? 'Web3Auth' : null));
    
  // Utility to format address for display
  const formatAddress = (address = publicKey) => {
    if (!address) return '';
    if (address.length <= 10) return address;
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  return {
    isConnected,
    publicKey,
    walletBalance,
    connectionType,
    formatAddress,
    
    // Include original state for specific needs
    isWeb3AuthLoggedIn,
    isWalletConnected,
    isWeb3AuthDirectConnected,
    authType,
    walletMethod,
    
    // Functions that work regardless of connection type
    logout,
    buyWithMoonpay,
    
    // Wallet-specific functions (will need to check connection type before using)
    signAndSubmitTransaction,
    getPrivateKey
  };
};

export default useUnifiedWallet; 