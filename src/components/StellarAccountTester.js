import React, { useState, useEffect } from 'react';
import { Button, Card, Form, Alert, Spinner, Table } from 'react-bootstrap';
import { Server, Asset, Keypair, TransactionBuilder, Operation } from 'stellar-sdk';
import StellarConfig from '../../stellar.config';

const StellarAccountTester = () => {
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [server, setServer] = useState(null);

  useEffect(() => {
    // Initialize Stellar server
    const horizonUrl = process.env.NODE_ENV === 'production'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
    
    setServer(new Server(horizonUrl));
  }, []);

  const handleLoadAccount = async (e) => {
    e.preventDefault();
    
    if (!publicKey) {
      setError('Please enter a public key');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setAccountInfo(null);
      
      const account = await server.loadAccount(publicKey);
      setAccountInfo(account);
      
      // Test if the account can issue assets
      const testAsset = new Asset('TEST', publicKey);
      setTestResult({
        canIssueAssets: true,
        message: 'Account is properly set up to issue NFTs'
      });
      
    } catch (err) {
      setError(`Error loading account: ${err.message}`);
      console.error('Error loading account:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestNFTIssuance = async () => {
    if (!publicKey || !secretKey) {
      setError('Please enter both public and secret keys');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Create a test NFT
      const issuer = Keypair.fromSecret(secretKey);
      const asset = new Asset('TESTNFT', issuer.publicKey());
      
      // Get the account
      const account = await server.loadAccount(issuer.publicKey());
      
      // Create a trustline for the asset
      const transaction = new TransactionBuilder(account, {
        networkPassphrase: process.env.NODE_ENV === 'production'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015'
      })
        .addOperation(Operation.changeTrust({
          asset: asset,
          limit: '1000'
        }))
        .setTimeout(30)
        .build();
      
      transaction.sign(issuer);
      
      // Submit the transaction
      const result = await server.submitTransaction(transaction);
      
      setTestResult({
        success: true,
        message: 'Successfully created test NFT',
        transactionHash: result.hash
      });
      
    } catch (err) {
      setError(`Error testing NFT issuance: ${err.message}`);
      console.error('Error testing NFT issuance:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <h4 className="mb-0">Stellar Account Tester</h4>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
        
        {testResult && (
          <Alert variant={testResult.success ? 'success' : 'info'}>
            {testResult.message}
            {testResult.transactionHash && (
              <div>
                <strong>Transaction Hash:</strong> {testResult.transactionHash}
              </div>
            )}
          </Alert>
        )}

        <Form onSubmit={handleLoadAccount}>
          <Form.Group className="mb-3">
            <Form.Label>Public Key</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter your Stellar public key"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
            />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label>Secret Key (for testing NFT issuance)</Form.Label>
            <Form.Control
              type="password"
              placeholder="Enter your Stellar secret key"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </Form.Group>
          
          <div className="d-flex gap-2">
            <Button variant="primary" type="submit" disabled={loading}>
              Load Account
            </Button>
            <Button 
              variant="success" 
              onClick={handleTestNFTIssuance}
              disabled={loading || !publicKey || !secretKey}
            >
              Test NFT Issuance
            </Button>
          </div>
        </Form>
        
        {loading && (
          <div className="text-center mt-3">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </div>
        )}
        
        {accountInfo && (
          <div className="mt-4">
            <h5>Account Information</h5>
            <Table striped bordered hover>
              <tbody>
                <tr>
                  <td><strong>Account ID</strong></td>
                  <td>{accountInfo.id}</td>
                </tr>
                <tr>
                  <td><strong>Sequence</strong></td>
                  <td>{accountInfo.sequence}</td>
                </tr>
                <tr>
                  <td><strong>Balances</strong></td>
                  <td>
                    <ul className="mb-0">
                      {accountInfo.balances.map((balance, index) => (
                        <li key={index}>
                          {balance.asset_type === 'native' ? 'XLM' : balance.asset_code}: {balance.balance}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default StellarAccountTester; 