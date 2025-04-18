import React, { useState } from 'react';
import { Button, Card, Form, Alert, Spinner } from 'react-bootstrap';
import { useStellarWallet } from '../contexts/StellarWalletContext';

const StellarWallet = () => {
  const {
    publicKey,
    isConnected,
    balance,
    loading,
    error,
    connectWallet,
    disconnectWallet,
    createNewAccount
  } = useStellarWallet();

  const [publicKeyInput, setPublicKeyInput] = useState('');

  const handleConnect = async (e) => {
    e.preventDefault();
    if (publicKeyInput) {
      await connectWallet(publicKeyInput);
      setPublicKeyInput('');
    }
  };

  const handleCreateAccount = async () => {
    try {
      const { publicKey } = await createNewAccount();
      setPublicKeyInput(publicKey);
    } catch (err) {
      console.error('Error creating account:', err);
    }
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <h4 className="mb-0">Stellar Wallet</h4>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="text-center">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </div>
        ) : (
          <>
            {isConnected ? (
              <div>
                <Alert variant="success">Wallet Connected</Alert>
                <p><strong>Public Key:</strong> {publicKey}</p>
                {balance && (
                  <div>
                    <h5>Balances:</h5>
                    <ul>
                      {balance.map((b, index) => (
                        <li key={index}>
                          {b.asset_type === 'native' ? 'XLM' : b.asset_code}: {b.balance}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button variant="danger" onClick={disconnectWallet}>
                  Disconnect Wallet
                </Button>
              </div>
            ) : (
              <Form onSubmit={handleConnect}>
                <Form.Group className="mb-3">
                  <Form.Label>Connect with Public Key</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter your Stellar public key"
                    value={publicKeyInput}
                    onChange={(e) => setPublicKeyInput(e.target.value)}
                  />
                </Form.Group>
                <div className="d-flex gap-2">
                  <Button variant="primary" type="submit">
                    Connect
                  </Button>
                  <Button variant="secondary" onClick={handleCreateAccount}>
                    Create New Account
                  </Button>
                </div>
              </Form>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default StellarWallet; 