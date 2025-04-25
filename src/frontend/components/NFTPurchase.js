import React, { useState, useEffect, useContext } from 'react';
import { Card, Button, Alert, Spinner, Modal } from 'react-bootstrap';
import { useWeb3Auth } from '../../contexts/Web3AuthContext';
import { useWalletConnect } from './WalletConnectProvider';
import { moonpayService } from '../../services';
import { toast } from 'react-hot-toast';

const NFTPurchase = ({ nft, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [purchaseMethod, setPurchaseMethod] = useState(null);
  const [moonpayInitialized, setMoonpayInitialized] = useState(false);
  const [moonpayError, setMoonpayError] = useState(null);
  const [isBuying, setIsBuying] = useState(false);
  
  const web3auth = useWeb3Auth();
  const walletConnect = useWalletConnect();
  
  // Initialize MoonPay when component mounts
  useEffect(() => {
    const initializeMoonPay = async () => {
      try {
        // Check if moonpayService is already initialized
        if (moonpayService.isInitialized()) {
          setMoonpayInitialized(true);
          return;
        }
        
        // Try to initialize
        await moonpayService.initialize();
        setMoonpayInitialized(true);
        setMoonpayError(null);
      } catch (error) {
        console.error("Failed to initialize MoonPay:", error.message);
        setMoonpayInitialized(false);
        
        // Get more detailed error message
        const errorDetails = moonpayService.getInitializationErrors();
        const errorMessage = errorDetails && errorDetails.length > 0 
          ? errorDetails[errorDetails.length - 1] 
          : error.message;
          
        setMoonpayError(errorMessage);
        
        // Display toast with error
        toast.error(`MoonPay initialization failed: ${errorMessage}`);
      }
    };
    
    initializeMoonPay();
    
    // Clean up event listeners when component unmounts
    return () => {
      if (window.moonPayBuyEventHandler) {
        window.removeEventListener('message', window.moonPayBuyEventHandler);
      }
    };
  }, []);
  
  // Get the wallet address from either Web3Auth or WalletConnect
  const getWalletAddress = () => {
    if (web3auth.isLoggedIn && web3auth.stellarAccount) {
      return web3auth.stellarAccount.publicKey;
    } else if (walletConnect.isConnected) {
      return walletConnect.publicKey;
    }
    return null;
  };
  
  // Check if the user is authenticated
  const isAuthenticated = () => {
    return web3auth.isLoggedIn || walletConnect.isConnected;
  };
  
  // Handle login with Web3Auth
  const handleWeb3AuthLogin = async () => {
    try {
      setLoading(true);
      await web3auth.login();
      setShowLoginModal(false);
      
      if (purchaseMethod === 'fiat') {
        handleFiatPurchase();
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle connect with WalletConnect
  const handleWalletConnectLogin = async () => {
    try {
      setLoading(true);
      await walletConnect.connectWallet();
      setShowLoginModal(false);
      
      if (purchaseMethod === 'crypto') {
        handleCryptoPurchase();
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle the fiat purchase flow
  const handleFiatPurchase = async () => {
    // Check if MoonPay is initialized
    if (!moonpayInitialized) {
      try {
        await moonpayService.initialize();
        setMoonpayInitialized(true);
      } catch (error) {
        toast.error(`Cannot initialize MoonPay: ${error.message}`);
        return;
      }
    }
    
    setIsBuying(true);
    
    try {
      const targetAddress = getWalletAddress() || web3auth.stellarAccount?.publicKey;
      
      if (!targetAddress) {
        throw new Error('Wallet address is required');
      }
      
      if (!nft || !nft.price) {
        throw new Error('NFT information is incomplete');
      }
      
      // Add error handling and retry logic
      let retryCount = 0;
      const maxRetries = 2;
      let lastError = null;
      
      while (retryCount <= maxRetries) {
        try {
          await moonpayService.buyNFTWithFiat({
            targetAddress: targetAddress,
            nftPriceInXLM: Number(nft.price),
            email: web3auth.userInfo?.email,
            onSuccess: (data) => {
              toast.success("Payment completed successfully!");
              setIsBuying(false);
              if (onSuccess) onSuccess(data);
            },
            onFailure: (error) => {
              console.error("Payment failed:", error);
              lastError = error;
              throw error; // Propagate error to retry logic
            }
          });
          
          // If successful, break out of retry loop
          break;
        } catch (attemptError) {
          console.error(`MoonPay attempt ${retryCount + 1} failed:`, attemptError);
          lastError = attemptError;
          
          if (retryCount >= maxRetries) {
            break;
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          retryCount++;
        }
      }
      
      if (lastError && retryCount > maxRetries) {
        toast.error(`Payment failed after multiple attempts: ${lastError.message || 'Unknown error'}`);
        setIsBuying(false);
      }
    } catch (error) {
      console.error("Error during MoonPay purchase:", error);
      toast.error(`Error: ${error.message}`);
      setIsBuying(false);
    }
  };
  
  // Handle the crypto purchase flow (using existing WalletConnect)
  const handleCryptoPurchase = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if user is connected with WalletConnect
      if (!walletConnect.isConnected) {
        setPurchaseMethod('crypto');
        setShowLoginModal(true);
        return;
      }
      
      // Use existing crypto purchase flow
      // (This would typically trigger the wallet for signing a transaction)
      // For simplicity, we'll just call onSuccess here
      if (onSuccess) {
        onSuccess({
          method: 'crypto',
          walletAddress: walletConnect.publicKey
        });
      }
      
      setLoading(false);
    } catch (error) {
      setError(`Error during crypto payment: ${error.message}`);
      setLoading(false);
    }
  };
  
  return (
    <>
      <Card className="mb-4">
        <Card.Header>
          <h4 className="mb-0">Purchase NFT</h4>
        </Card.Header>
        <Card.Body>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          <div className="mb-3">
            <h5>{nft.name}</h5>
            <p className="mb-1">{nft.description}</p>
            <p className="mb-1"><strong>Price:</strong> {nft.price} XLM</p>
          </div>
          
          <div className="d-flex flex-column gap-2">
            <Button 
              variant="primary" 
              onClick={handleFiatPurchase}
              disabled={isBuying || !moonpayInitialized}
            >
              {isBuying ? (
                <Spinner animation="border" size="sm" className="me-2" />
              ) : null}
              Buy with Credit/Debit Card
            </Button>
            
            <Button 
              variant="outline-primary" 
              onClick={handleCryptoPurchase}
              disabled={loading}
            >
              {loading && purchaseMethod === 'crypto' ? (
                <Spinner animation="border" size="sm" className="me-2" />
              ) : null}
              Buy with Crypto
            </Button>
          </div>
          
          {/* Display MoonPay errors if any */}
          {moonpayError && (
            <div className="alert alert-warning mt-3">
              <h6 className="mb-1">MoonPay Service Error</h6>
              <p className="mb-1 small">{moonpayError}</p>
              <hr className="my-2" />
              <p className="mb-0 small">
                Please check your internet connection. If the problem persists, please contact support.
              </p>
            </div>
          )}
        </Card.Body>
      </Card>
      
      {/* Login Modal */}
      <Modal show={showLoginModal} onHide={() => setShowLoginModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Login Required</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {purchaseMethod === 'fiat' ? (
            <div className="text-center py-3">
              <p>To purchase with a credit/debit card, please login with your email or Google account.</p>
              <Button 
                variant="primary" 
                onClick={handleWeb3AuthLogin}
                disabled={loading}
                className="mt-2"
              >
                {loading ? (
                  <Spinner animation="border" size="sm" className="me-2" />
                ) : null}
                Login with Email/Google
              </Button>
            </div>
          ) : (
            <div className="text-center py-3">
              <p>To purchase with crypto, please connect your Stellar wallet.</p>
              <Button 
                variant="primary" 
                onClick={handleWalletConnectLogin}
                disabled={loading}
                className="mt-2"
              >
                {loading ? (
                  <Spinner animation="border" size="sm" className="me-2" />
                ) : null}
                Connect Wallet
              </Button>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowLoginModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default NFTPurchase; 