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
              Connected to Stellar wallet
              <br />
              Public Key: {publicKey}
              {accountBalance && (
                <div className="mt-2">
                  Balance: {accountBalance} XLM
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
              Connect your Stellar wallet to start using the NFT marketplace
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