import React, { useState, useEffect } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

const SecurityAlert = () => {
  const [showAlert, setShowAlert] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [securityIssues, setSecurityIssues] = useState([]);

  useEffect(() => {
    // Check for security issues when component mounts
    checkSecurityIssues();
  }, []);

  const checkSecurityIssues = () => {
    const issues = [];

    // Check for default/exposed credentials
    if (import.meta.env.VITE_PINATA_API_KEY === 'efe673ec8c032ecbd87a') {
      issues.push('Exposed Pinata API Key detected');
    }

    if (import.meta.env.VITE_STELLAR_ISSUER_PUBLIC_KEY === 'GAHDNV6A6NSOQM5AMU64NH2LOOAIK474NCGX2FXTXBKD5YUZLTZQKSPV') {
      issues.push('Exposed Stellar Public Key detected');
    }

    if (import.meta.env.VITE_INFURA_KEY === 'cd1f481035af45bd84d3b7589667d7e9') {
      issues.push('Exposed Infura API Key detected');
    }

    // Set security issues and show alert if issues are found
    setSecurityIssues(issues);
    setShowAlert(issues.length > 0);
  };

  return (
    <>
      {showAlert && (
        <Alert 
          variant="danger" 
          className="m-3"
          onClose={() => setShowAlert(false)} 
          dismissible
        >
          <Alert.Heading>🚨 CRITICAL SECURITY ALERT 🚨</Alert.Heading>
          <p>
            <strong>Your credentials have been exposed and must be regenerated immediately!</strong>
          </p>
          <Button 
            variant="outline-danger" 
            onClick={() => setShowModal(true)}
          >
            View Security Details
          </Button>
        </Alert>
      )}

      <Modal 
        show={showModal} 
        onHide={() => setShowModal(false)} 
        size="lg"
        centered
      >
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title>CRITICAL SECURITY ALERT</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <h5>Detected Security Issues:</h5>
          <ul>
            {securityIssues.map((issue, index) => (
              <li key={index}><strong>{issue}</strong></li>
            ))}
          </ul>
          <hr/>
          <p>Your application contains exposed credentials that must be regenerated immediately.</p>
          <p>Please follow the instructions in the <code>SECURITY_ALERT.md</code> file in your project root to secure your application.</p>
          <h5>Critical Actions Required:</h5>
          <ol>
            <li>Regenerate ALL exposed API keys and private keys</li>
            <li>Update your .env file with new credentials</li>
            <li>Never commit credentials to version control</li>
            <li>Check for unauthorized activity on your accounts</li>
          </ol>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Close
          </Button>
          <Button variant="danger" onClick={() => window.open('https://app.pinata.cloud/keys', '_blank')}>
            Regenerate Pinata Keys
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default SecurityAlert;

