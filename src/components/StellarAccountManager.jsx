import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Spinner, Form, Row, Col } from 'react-bootstrap';
import { useWallet } from '../contexts/WalletContext';
import web3AuthStellarService from '../services/web3AuthStellarService';
import { toast } from 'react-hot-toast';
import { FaWallet, FaCoins, FaMoneyBill, FaExchangeAlt, FaInfoCircle, FaSync } from 'react-icons/fa';

const StellarAccountManager = () => {
  const { 
    isLoggedIn, 
    publicKey, 
    walletBalance, 
    isLoading, 
    error, 
    login, 
    logout,
    refreshBalance,
    buyWithMoonpay,
    loginWithWeb3Auth
  } = useWallet();

  const [fundAmount, setFundAmount] = useState(10);
  const [showDetails, setShowDetails] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  
  useEffect(() => {
    // Refresh balance periodically
    if (isLoggedIn && publicKey) {
      // Immediate refresh on mount
      refreshBalance();
      
      const intervalId = setInterval(() => {
        refreshBalance();
      }, 30000); // Every 30 seconds
      
      return () => clearInterval(intervalId);
    }
  }, [isLoggedIn, publicKey, refreshBalance]);

  const handleAirdropXLM = async () => {
    if (!isLoggedIn || !publicKey) {
      toast.error('Please login first');
      return;
    }
    
    try {
      const result = await web3AuthStellarService.airdropXLM(publicKey);
      toast.success(`Successfully airdropped ${result.amount} XLM to your account!`);
      await refreshBalance();
    } catch (error) {
      console.error('Airdrop error:', error);
      toast.error('Failed to airdrop XLM. You may have reached the testnet limit.');
    }
  };

  const handleBuyXLM = async () => {
    if (!isLoggedIn || !publicKey) {
      toast.error('Please login first');
      return;
    }
    
    try {
      await buyWithMoonpay(null, fundAmount);
    } catch (error) {
      console.error('MoonPay error:', error);
      // Error message is now handled in buyWithMoonpay
    }
  };

  const handleForceRefresh = async () => {
    try {
      if (!isLoggedIn) {
        toast.error('Please login first');
        return;
      }
      
      toast.success('Refreshing wallet balance...');
      await refreshBalance();
      toast.success('Refresh complete!');
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error('Failed to refresh balance');
    }
  };

  const handleReconnect = async () => {
    try {
      setReconnecting(true);
      toast.loading('Reconnecting wallet...');
      
      // First clear any existing wallet data from localStorage
      localStorage.removeItem('tempPrivateKey');
      
      // Then logout
      await logout();
      
      // Wait a moment to ensure logout completes
      setTimeout(async () => {
        try {
          console.log("Starting wallet reconnection...");
          await loginWithWeb3Auth();
          
          // Give time for the wallet creation to complete
          setTimeout(() => {
            toast.dismiss();
            if (publicKey) {
              toast.success('Wallet reconnected successfully!');
              refreshBalance();
            } else {
              toast.error('Wallet reconnection failed. Please try again.');
            }
            setReconnecting(false);
          }, 3000);
        } catch (loginError) {
          console.error('Error during login phase of reconnect:', loginError);
          toast.error('Reconnection failed. Please try manual login.');
          setReconnecting(false);
        }
      }, 1000);
    } catch (error) {
      console.error('Reconnect error:', error);
      toast.error('Failed to reconnect wallet');
      setReconnecting(false);
    }
  };

  const formatPublicKey = (key) => {
    if (!key) return '';
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  if (isLoading || reconnecting) {
    return (
      <div className="text-center my-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-2">{reconnecting ? 'Reconnecting wallet...' : 'Loading wallet...'}</p>
      </div>
    );
  }

  return (
    <Card className="shadow-sm mb-4">
      <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
        <h5 className="mb-0"><FaWallet className="me-2" /> Stellar Account</h5>
        {isLoggedIn ? (
          <Button variant="outline-light" size="sm" onClick={logout}>
            Logout
          </Button>
        ) : (
          <Button variant="outline-light" size="sm" onClick={loginWithWeb3Auth}>
            Login with Web3Auth
          </Button>
        )}
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        
        {isLoggedIn && publicKey ? (
          <>
            <div className="mb-3">
              <div className="d-flex justify-content-between">
                <span className="text-muted">Wallet Address:</span>
                <span className="font-monospace">
                  {formatPublicKey(publicKey)}
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="p-0 ms-2"
                    onClick={() => {
                      navigator.clipboard.writeText(publicKey);
                      toast.success('Address copied to clipboard!');
                    }}
                  >
                    Copy
                  </Button>
                </span>
              </div>

              <div className="d-flex justify-content-between mt-2">
                <span className="text-muted">Balance:</span>
                <span className="font-weight-bold">
                  {walletBalance ? (
                    <span className="text-success">{parseFloat(walletBalance.xlm).toFixed(2)} XLM</span>
                  ) : (
                    'Loading...'
                  )}
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="p-0 ms-2"
                    onClick={handleForceRefresh}
                    title="Refresh Balance"
                  >
                    <FaSync />
                  </Button>
                </span>
              </div>
              
              <Button 
                variant="link" 
                className="p-0 mt-2" 
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? 'Hide Details' : 'Show Details'}
              </Button>

              {showDetails && walletBalance && (
                <div className="mt-3 small">
                  <Alert variant="info">
                    <div><FaInfoCircle className="me-2" /> This Stellar account is on the <strong>Testnet</strong> network.</div>
                    <div className="mt-2">Full Address: <span className="font-monospace">{publicKey}</span></div>
                    <div className="mt-2">
                      <strong>Balances:</strong>
                      {walletBalance.balances.map((balance, index) => (
                        <div key={index} className="ms-3 mt-1">
                          {balance.asset_type === 'native' ? (
                            <span>{parseFloat(balance.balance).toFixed(6)} XLM</span>
                          ) : (
                            <span>
                              {parseFloat(balance.balance).toFixed(6)} {balance.asset_code}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Button 
                        variant="warning" 
                        size="sm"
                        onClick={handleReconnect}
                        disabled={reconnecting}
                      >
                        <FaSync className="me-2" /> Reconnect Wallet
                      </Button>
                      <div className="mt-1 small text-muted">
                        Use this if your wallet isn't working correctly
                      </div>
                    </div>
                  </Alert>
                </div>
              )}
            </div>

            <hr />

            <h6 className="mb-3"><FaCoins className="me-2" /> Fund Your Account</h6>
            
            <Row className="mb-3">
              <Col>
                <Button 
                  variant="outline-primary" 
                  className="w-100 mb-2"
                  onClick={handleAirdropXLM}
                >
                  <FaCoins className="me-2" /> Get 10,000 XLM (Testnet)
                </Button>
              </Col>
            </Row>
            
            <Row className="mb-3">
              <Col md={8}>
                <Form.Group>
                  <Form.Label>Amount in USD</Form.Label>
                  <Form.Control
                    type="number"
                    min="10"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  />
                  <Form.Text className="text-muted">
                    Minimum amount is $10
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={4} className="d-flex align-items-end">
                <Button 
                  variant="success" 
                  className="w-100"
                  onClick={handleBuyXLM}
                >
                  <FaMoneyBill className="me-2" /> Buy XLM
                </Button>
              </Col>
            </Row>
          </>
        ) : (
          <Alert variant="info">
            <FaInfoCircle className="me-2" /> Log in with Web3Auth to create or access your Stellar wallet and receive 10,000 XLM on the testnet automatically.
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
};

export default StellarAccountManager; 