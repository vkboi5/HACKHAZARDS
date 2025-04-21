import React, { useState } from 'react';
import { MoonPayBuyWidget } from '@moonpay/moonpay-react';
import './MoonPayWidget.css';

const MoonPayWidget = ({ walletAddress }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(null);

  const handleBuyClick = () => {
    if (!process.env.REACT_APP_MOONPAY_PUBLISHABLE_KEY) {
      setError('MoonPay service is not configured. Please contact support.');
      return;
    }
    if (!walletAddress) {
      setError('Please connect your wallet first.');
      return;
    }
    setIsVisible(true);
  };

  const onCloseWidget = () => {
    setIsVisible(false);
    setError(null);
  };

  return (
    <div className="moonpay-widget">
      <button
        className="buy-crypto-btn"
        onClick={handleBuyClick}
        disabled={!walletAddress}
      >
        Buy with Credit Card
      </button>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {isVisible && (
        <div className="moonpay-container">
          <MoonPayBuyWidget
            variant="overlay"
            baseCurrencyCode="usd"
            baseCurrencyAmount="100"
            defaultCurrencyCode="xlm"
            walletAddress={walletAddress}
            onCloseWidget={onCloseWidget}
          />
        </div>
      )}
    </div>
  );
};

export default MoonPayWidget; 