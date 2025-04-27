import React, { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';

const PayWithMoonpay = ({ amount, onSuccess, onError }) => {
  const [moonpayUrl, setMoonpayUrl] = useState('');

  useEffect(() => {
    // Initialize MoonPay URL with your API key and parameters
    const baseUrl = 'https://buy-staging.moonpay.com';
    const apiKey = process.env.REACT_APP_MOONPAY_API_KEY;
    
    const params = new URLSearchParams({
      apiKey: apiKey,
      currencyCode: 'xlm',
      walletAddress: '', // Add user's Stellar wallet address here
      baseCurrencyAmount: amount,
      showWalletAddressForm: true,
    });

    setMoonpayUrl(`${baseUrl}?${params.toString()}`);
  }, [amount]);

  const handleMoonpayClick = () => {
    try {
      // Open MoonPay in a new window
      const moonpayWindow = window.open(moonpayUrl, 'MoonPay', 'width=600,height=800');

      // Listen for messages from MoonPay
      window.addEventListener('message', (event) => {
        if (event.origin === 'https://buy-staging.moonpay.com') {
          const { data } = event;
          
          if (data.status === 'completed') {
            moonpayWindow.close();
            onSuccess(data);
          } else if (data.status === 'failed') {
            moonpayWindow.close();
            onError(new Error('Payment failed'));
          }
        }
      });
    } catch (error) {
      onError(error);
    }
  };

  return (
    <Button 
      variant="primary" 
      onClick={handleMoonpayClick}
      className="w-100"
    >
      Pay with MoonPay
    </Button>
  );
};

export default PayWithMoonpay; 