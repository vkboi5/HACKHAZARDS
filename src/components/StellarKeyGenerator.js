import React, { useState } from 'react';
import { Button, Card, Form, Alert, Spinner } from 'react-bootstrap';
import { generateStellarKeys, getFriendbotUrl, updateEnvWithStellarKeys } from '../services/generateStellarKeys';

const StellarKeyGenerator = () => {
  const [keys, setKeys] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleGenerateKeys = () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      
      const newKeys = generateStellarKeys();
      setKeys(newKeys);
      updateEnvWithStellarKeys(newKeys.publicKey, newKeys.secretKey);
      
      setSuccess(true);
    } catch (err) {
      setError(err.message);
      console.error('Error generating Stellar keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };

  const handleOpenFriendbot = () => {
    if (keys && keys.publicKey) {
      window.open(getFriendbotUrl(keys.publicKey), '_blank');
    }
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <h4 className="mb-0">Stellar Key Generator</h4>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert variant="success" onClose={() => setSuccess(false)} dismissible>
            Keys generated successfully! Add them to your .env file.
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
            {keys ? (
              <div>
                <Alert variant="info">
                  <strong>IMPORTANT:</strong> Save these keys securely! They will be used to issue NFTs on the Stellar network.
                </Alert>
                
                <Form.Group className="mb-3">
                  <Form.Label>Public Key</Form.Label>
                  <div className="d-flex">
                    <Form.Control
                      type="text"
                      value={keys.publicKey}
                      readOnly
                    />
                    <Button 
                      variant="outline-secondary" 
                      className="ms-2"
                      onClick={() => handleCopyToClipboard(keys.publicKey)}
                    >
                      Copy
                    </Button>
                  </div>
                </Form.Group>
                
                <Form.Group className="mb-3">
                  <Form.Label>Secret Key</Form.Label>
                  <div className="d-flex">
                    <Form.Control
                      type="password"
                      value={keys.secretKey}
                      readOnly
                    />
                    <Button 
                      variant="outline-secondary" 
                      className="ms-2"
                      onClick={() => handleCopyToClipboard(keys.secretKey)}
                    >
                      Copy
                    </Button>
                  </div>
                </Form.Group>
                
                <div className="d-flex gap-2 mb-3">
                  <Button variant="primary" onClick={handleOpenFriendbot}>
                    Fund Account with Testnet XLM
                  </Button>
                  <Button variant="secondary" onClick={() => setKeys(null)}>
                    Generate New Keys
                  </Button>
                </div>
                
                <Alert variant="warning">
                  <h5>Next Steps:</h5>
                  <ol>
                    <li>Add these keys to your .env file</li>
                    <li>Click "Fund Account" to get testnet XLM</li>
                    <li>Use these keys to issue NFTs on the Stellar testnet</li>
                  </ol>
                </Alert>
              </div>
            ) : (
              <div className="text-center">
                <p>Generate a new Stellar keypair to use as your NFT issuer account.</p>
                <Button variant="primary" onClick={handleGenerateKeys}>
                  Generate Stellar Keys
                </Button>
              </div>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default StellarKeyGenerator; 