import React from 'react';
import { useMoonPay } from '@moonpay/moonpay-react';
import './MoonPayWidget.css';

const MoonPayWidget = ({ walletAddress }) => {
  const { openMoonPay } = useMoonPay();

  const handleBuyCrypto = () => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }

    openMoonPay({
      currencyCode: 'eth',
      baseCurrencyAmount: 100,
      baseCurrencyCode: 'usd',
      walletAddress: walletAddress,
      redirectURL: window.location.origin,
      environment: process.env.REACT_APP_MOONPAY_ENV || 'test',
    });
  };

  return (
    <div className="moonpay-widget">
      <button 
        className="buy-crypto-btn" 
        onClick={handleBuyCrypto}
        disabled={!walletAddress}
      >
        {walletAddress ? 'Buy Crypto' : 'Connect Wallet to Buy Crypto'}
      </button>
    </div>
  );
};

export default MoonPayWidget; 