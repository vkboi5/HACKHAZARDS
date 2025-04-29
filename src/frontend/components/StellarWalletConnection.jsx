import React, { useState, useEffect } from 'react';
import { useStellarWallet } from './StellarWalletProvider';
import { Button, Alert, Spinner } from 'react-bootstrap';
import './StellarWallet.css';

export function StellarWalletConnection() {
  const { publicKey, isConnected, error, connectWallet, disconnectWallet, getAccountDetails } = useStellarWallet();
  const [accountBalance, setAccountBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAccountDetails = async () => {
      if (isConnected && publicKey) {
        try {
          setLoading(true);
          const account = await getAccountDetails();
          const xlmBalance = account.balances.find(b => b.asset_type === 'native');
          setAccountBalance(xlmBalance ? xlmBalance.balance : '0');
        } catch (err) {
          console.error('Failed to load account details:', err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadAccountDetails();
  }, [isConnected, publicKey, getAccountDetails]);

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
              <div className="public-key">
                {publicKey}
              </div>
              {accountBalance && (
                <div className="mt-3">
                  <strong>Balance:</strong> {parseFloat(accountBalance).toFixed(2)} XLM
                </div>
              )}
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