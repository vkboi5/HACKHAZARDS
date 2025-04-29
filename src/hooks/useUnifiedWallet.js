import { useWallet } from '../contexts/WalletContext';
import { useWalletConnect } from '../frontend/components/WalletConnectProvider';

/**
 * Custom hook that unifies both wallet interfaces (Web3Auth and WalletConnect)
 * to provide a single, consistent interface for interacting with any connected wallet
 */
const useUnifiedWallet = () => {
  // Get state from both wallet providers
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

  // Combined connection state
  const isConnected = isWeb3AuthLoggedIn || isWalletConnected;
  const publicKey = web3AuthKey || walletConnectKey;
  
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
    : (isWalletConnected ? (walletMethod || 'WalletConnect') : null);
    
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