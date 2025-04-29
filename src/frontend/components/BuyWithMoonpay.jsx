import React from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { useWalletConnect } from './WalletConnectProvider';
import { Button } from 'react-bootstrap';
import { toast } from 'react-hot-toast';

const BuyWithMoonpay = ({ nftId, price }) => {
  // Get state from both wallet providers
  const { isLoggedIn: isWeb3AuthLoggedIn, buyWithMoonpay } = useWallet();
  const { isConnected: isWalletConnected } = useWalletConnect();
  
  // Combined connection state
  const isConnected = isWeb3AuthLoggedIn || isWalletConnected;

  const handleBuy = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    try {
      console.log("Initiating MoonPay purchase:", { nftId, price });
      console.log("Wallet connection status:", { 
        web3Auth: isWeb3AuthLoggedIn, 
        walletConnect: isWalletConnected 
      });
      
      await buyWithMoonpay(nftId, price);
    } catch (error) {
      console.error('Error initiating Moonpay purchase:', error);
      toast.error('Error initiating purchase. Please try again.');
    }
  };

  return (
    <Button 
      variant="success" 
      onClick={handleBuy}
      disabled={!isConnected}
    >
      Buy with Card
    </Button>
  );
};

export default BuyWithMoonpay; 