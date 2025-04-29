import React, { useState } from 'react';
import { Container, Row, Col, Tabs, Tab, Alert } from 'react-bootstrap';
import StellarKeyGenerator from './StellarKeyGenerator';
import StellarAccountTester from './StellarAccountTester';
import StellarWallet from './StellarWallet';

const StellarSetup = () => {
  const [activeTab, setActiveTab] = useState('keys');
  const [showInstructions, setShowInstructions] = useState(true);

  return (
    <Container className="py-4">
      <h2 className="mb-4">Stellar Integration Setup</h2>
      
      {showInstructions && (
        <Alert variant="info" onClose={() => setShowInstructions(false)} dismissible className="mb-4">
          <h4>Getting Started with Stellar</h4>
          <p>Follow these steps to set up your Stellar integration:</p>
          <ol>
            <li>Generate a Stellar keypair for your NFT issuer account</li>
            <li>Fund your account with testnet XLM using the Friendbot</li>
            <li>Test your account to ensure it can issue NFTs</li>
            <li>Connect your wallet to start using the NFT marketplace</li>
          </ol>
        </Alert>
      )}
      
      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-4"
      >
        <Tab eventKey="keys" title="Generate Keys">
          <Row className="mt-3">
            <Col>
              <StellarKeyGenerator />
            </Col>
          </Row>
        </Tab>
        
        <Tab eventKey="test" title="Test Account">
          <Row className="mt-3">
            <Col>
              <StellarAccountTester />
            </Col>
          </Row>
        </Tab>
        
        <Tab eventKey="wallet" title="Connect Wallet">
          <Row className="mt-3">
            <Col>
              <StellarWallet />
            </Col>
          </Row>
        </Tab>
      </Tabs>
      
      <Alert variant="warning" className="mt-4">
        <h5>Important Notes:</h5>
        <ul>
          <li>Always keep your secret keys secure and never share them</li>
          <li>For production, use proper key management solutions</li>
          <li>Test thoroughly on the Stellar testnet before going to production</li>
          <li>Make sure to update your .env file with the correct Stellar credentials</li>
        </ul>
      </Alert>
    </Container>
  );
};

export default StellarSetup; 