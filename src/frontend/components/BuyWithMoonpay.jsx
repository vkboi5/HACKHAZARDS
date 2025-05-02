import React from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { useWalletConnect } from './WalletConnectProvider';
import { useWeb3Auth } from './Web3AuthProvider';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FaInfoCircle } from 'react-icons/fa';
import { toast } from 'react-hot-toast';

const BuyWithMoonpay = ({ nftId, price, nftDetails, name = "Buy with Card" }) => {
  // Get state from all wallet providers
  const { isLoggedIn: isWeb3AuthLoggedIn, buyWithMoonpay } = useWallet();
  const { isConnected: isWalletConnected } = useWalletConnect();
  const { isConnected: isWeb3AuthDirectConnected } = useWeb3Auth();
  
  // Combined connection state including direct Web3Auth connection
  const isConnected = isWeb3AuthLoggedIn || isWalletConnected || isWeb3AuthDirectConnected;

  const handleBuy = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!price || isNaN(parseFloat(price))) {
      toast.error('Invalid price for this NFT');
      return;
    }
    
    try {
      // Ensure price is a valid number
      const xlmAmount = parseFloat(price);
      console.log("Initiating MoonPay purchase:", { nftId, price: xlmAmount });
      console.log("Wallet connection status:", { 
        web3Auth: isWeb3AuthLoggedIn, 
        walletConnect: isWalletConnected,
        web3AuthDirect: isWeb3AuthDirectConnected
      });
      
      // Use nftDetails if provided, otherwise create a minimal one with just the ID
      const nftDetailsFinal = nftDetails || (nftId ? { id: nftId } : null);
      
      if (nftDetailsFinal) {
        console.log("Using NFT details for purchase:", nftDetailsFinal);
      }
      
      await buyWithMoonpay(nftId, xlmAmount, nftDetailsFinal);
    } catch (error) {
      console.error('Error initiating Moonpay purchase:', error);
      toast.error('Error initiating purchase. Please try again.');
    }
  };

  return (
    <OverlayTrigger
      placement="top"
      overlay={
        <Tooltip id="moonpay-tooltip">
          Purchase XLM with a credit/debit card to buy this NFT. After your XLM arrives, you can complete the purchase.
        </Tooltip>
      }
    >
      <Button 
        variant="success" 
        onClick={handleBuy}
        disabled={!isConnected}
      >
        {name} <FaInfoCircle style={{ marginLeft: '5px', fontSize: '0.8em' }} />
      </Button>
    </OverlayTrigger>
  );
};

export default BuyWithMoonpay; 