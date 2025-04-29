import React, { useState, useEffect } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import { Button, Alert, Spinner } from 'react-bootstrap';
import './WalletConnect.css';

export function WalletConnectConnection() {
  const { 
    publicKey, 
    isConnected, 
    error, 
    isInitializing,
    connectWallet, 
    disconnectWallet, 
    getAccountDetails,
    balanceInXLM,
    walletMethod
  } = useWalletConnect();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAccountDetails = async () => {
      if (isConnected && publicKey) {
        try {
          setLoading(true);
          await getAccountDetails();
        } catch (err) {
          console.error('Failed to load account details:', err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadAccountDetails();
  }, [isConnected, publicKey, getAccountDetails]);

  if (isInitializing) {
    return (
      <div className="wallet-connection-container">
        <div className="text-center">
          <Spinner animation="border" variant="primary" />
          <p>Initializing wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-connection-container">
      <div className="wallet-status">
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : isConnected ? (
          <>
            <Alert variant="success">
              <h4 className="mb-2">Connected to Stellar Network</h4>
              <div className="connection-type">
                {walletMethod === 'walletconnect' 
                  ? 'Via WalletConnect (LOBSTR/Solar)' 
                  : 'Manual Connection'}
              </div>
              <div className="public-key">
                {publicKey}
              </div>
              <div className="mt-3">
                <strong>Balance:</strong> {balanceInXLM.toFixed(2)} XLM
              </div>
            </Alert>
            <Button variant="outline-danger" onClick={disconnectWallet}>
              Disconnect Wallet
            </Button>
          </>
        ) : (
          <>
            <Alert variant="info">
              <h4 className="mb-2">Wallet Not Connected</h4>
              <p>Connect your Stellar wallet to start using the NFT marketplace</p>
            </Alert>
            <Button variant="primary" onClick={connectWallet}>
              Connect Wallet
            </Button>
          </>
        )}
        {error && (
          <Alert variant="danger" className="mt-3">
            {error}
          </Alert>
        )}
      </div>
    </div>
  );
} 