import React from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { Button } from 'react-bootstrap';

const BuyWithMoonpay = ({ nftId, price }) => {
  const { isLoggedIn, buyWithMoonpay } = useWallet();

  const handleBuy = async () => {
    if (!isLoggedIn) {
      alert('Please login first');
      return;
    }
    try {
      await buyWithMoonpay(nftId, price);
    } catch (error) {
      console.error('Error initiating Moonpay purchase:', error);
      alert('Error initiating purchase. Please try again.');
    }
  };

  return (
    <Button 
      variant="success" 
      onClick={handleBuy}
      disabled={!isLoggedIn}
    >
      Buy with Card
    </Button>
  );
};

export default BuyWithMoonpay; 