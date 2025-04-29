import React, { useState } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { useWalletConnect } from './WalletConnectProvider';
import { useWeb3Auth } from './Web3AuthProvider';
import StellarAccountManager from '../../components/StellarAccountManager';
import TraditionalAuth from './TraditionalAuth';
import './WalletConnection.css';

export function WalletConnection() {
  const { 
    publicKey: stellarPublicKey, 
    isConnected: isStellarConnected, 
    error: stellarError,
    connectWallet: connectStellarWallet,
    disconnectWallet: disconnectStellarWallet,
    balanceInXLM
  } = useWalletConnect();

  const {
    publicKey: web3AuthPublicKey,
    isConnected: isWeb3AuthConnected,
    error: web3AuthError,
    login: web3AuthLogin,
    logout: web3AuthLogout
  } = useWeb3Auth();

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStellarConnect = async () => {
    try {
      setLoading(true);
      await connectStellarWallet();
    } catch (err) {
      console.error('Failed to connect Stellar wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleWeb3AuthConnect = async () => {
    try {
      setLoading(true);
      await web3AuthLogin();
    } catch (err) {
      console.error('Failed to connect with Web3Auth:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-5">
      <Row>
        <Col md={12}>
          <h2 className="mb-4 text-center">Wallet Management</h2>
          <p className="text-center mb-5">
            Connect your wallet to interact with the application. You can use a Stellar wallet, Web3Auth, or create a traditional account.
          </p>
        </Col>
      </Row>
      
      <Row>
        <Col lg={4} className="mb-4">
          <h3 className="mb-3">Email & Password</h3>
          <p>Create a traditional account using email and password. A Stellar wallet will be automatically created for you.</p>
          <TraditionalAuth />
        </Col>
        
        <Col lg={4} className="mb-4">
          <h3 className="mb-3">Web3Auth Integration</h3>
          <p>Login with Google/Email using Web3Auth to automatically create a Stellar wallet and receive 10,000 XLM for testing.</p>
          <StellarAccountManager />
        </Col>
        
        <Col lg={4} className="mb-4">
          <h3 className="mb-3">Stellar Wallet Connection</h3>
          <p>Connect using your existing Stellar wallet such as Freighter, Albedo, or Lobstr.</p>
          <div className="connect-wallet-btn">
            <button 
              className="btn btn-primary btn-lg btn-block" 
              onClick={() => {
                const connectStellarWalletBtn = document.querySelector('.connect-wallet-button');
                if (connectStellarWalletBtn) {
                  connectStellarWalletBtn.click();
                }
              }}
            >
              Connect Stellar Wallet
            </button>
          </div>
          
          {isStellarConnected && (
            <div className="mt-3 p-3 border rounded bg-light">
              <h5>Connected Wallet</h5>
              <p className="mb-0">
                <strong>Address:</strong> {stellarPublicKey ? 
                  `${stellarPublicKey.substring(0, 4)}...${stellarPublicKey.substring(stellarPublicKey.length - 4)}` : 
                  'Loading...'}
              </p>
            </div>
          )}
        </Col>
      </Row>
      
      <Row className="mt-4">
        <Col md={12}>
          <div className="alert alert-info">
            <h5>Choose Your Preferred Method</h5>
            <p>
              <strong>Traditional Account:</strong> Create an account with email and password. We'll automatically create and manage a Stellar wallet for you.
            </p>
            <p>
              <strong>Web3Auth:</strong> Use your existing Google or email account to create and manage a Stellar wallet.
              When you log in, a Stellar wallet is automatically created and funded with 10,000 XLM on the Testnet.
            </p>
            <p className="mb-0">
              <strong>Stellar Wallet:</strong> If you already have a Stellar wallet like Freighter, Albedo, or Lobstr, you can connect it directly
              to interact with the application without creating a new wallet.
            </p>
          </div>
        </Col>
      </Row>
    </Container>
  );
} 