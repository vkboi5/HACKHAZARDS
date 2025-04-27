import React, { useState } from 'react';
import { Button, Alert, Spinner, Modal } from 'react-bootstrap';
import { useWalletConnect } from './WalletConnectProvider';
import { useWeb3Auth } from './Web3AuthProvider';
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
    <div className="wallet-connection-container">
      <div className="wallet-status">
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : (
          <>
            {/* Stellar Wallet Connection */}
            {isStellarConnected ? (
              <Alert variant="success" className="mb-3">
                <h4 className="mb-2">Connected to Stellar Network</h4>
                <div className="public-key">
                  {stellarPublicKey}
                </div>
                <div className="mt-3">
                  <strong>Balance:</strong> {balanceInXLM.toFixed(2)} XLM
                </div>
                <Button 
                  variant="outline-danger" 
                  onClick={disconnectStellarWallet}
                  className="mt-2"
                >
                  Disconnect Stellar Wallet
                </Button>
              </Alert>
            ) : (
              <Alert variant="info" className="mb-3">
                <h4 className="mb-2">Stellar Wallet Not Connected</h4>
                <p>Connect your Stellar wallet to interact with NFTs</p>
                <Button variant="primary" onClick={handleStellarConnect}>
                  Connect Stellar Wallet
                </Button>
              </Alert>
            )}

            {/* Web3Auth Connection */}
            {isWeb3AuthConnected ? (
              <Alert variant="success" className="mb-3">
                <h4 className="mb-2">Connected with Web3Auth</h4>
                <div className="public-key">
                  {web3AuthPublicKey}
                </div>
                <Button 
                  variant="outline-danger" 
                  onClick={web3AuthLogout}
                  className="mt-2"
                >
                  Logout from Web3Auth
                </Button>
              </Alert>
            ) : (
              <Alert variant="info" className="mb-3">
                <h4 className="mb-2">Web3Auth Not Connected</h4>
                <p>Login with Web3Auth for additional features</p>
                <Button variant="primary" onClick={handleWeb3AuthConnect}>
                  Login with Web3Auth
                </Button>
              </Alert>
            )}

            {/* Error Messages */}
            {stellarError && (
              <Alert variant="danger" className="mt-3">
                {stellarError}
              </Alert>
            )}
            {web3AuthError && (
              <Alert variant="danger" className="mt-3">
                {web3AuthError}
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
  );
} 