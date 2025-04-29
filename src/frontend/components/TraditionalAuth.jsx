import React, { useState } from 'react';
import { Card, Form, Button, Alert, Tabs, Tab } from 'react-bootstrap';
import { useWallet } from '../../contexts/WalletContext';
import { FaEnvelope, FaLock, FaUser } from 'react-icons/fa';

const TraditionalAuth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeTab, setActiveTab] = useState('login');
  const [validationError, setValidationError] = useState('');

  const { 
    loginWithTraditional, 
    registerTraditional, 
    isLoading, 
    error 
  } = useWallet();

  const handleLogin = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    if (!email || !password) {
      setValidationError('Please enter both email and password');
      return;
    }
    
    await loginWithTraditional(email, password);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    if (!email || !password || !confirmPassword) {
      setValidationError('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long');
      return;
    }
    
    const success = await registerTraditional(email, password);
    if (success) {
      setActiveTab('login');
    }
  };

  return (
    <Card className="shadow-sm mb-4">
      <Card.Header className="bg-primary text-white">
        <h5 className="mb-0">Account Access</h5>
      </Card.Header>
      <Card.Body>
        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k)}
          className="mb-3"
        >
          <Tab eventKey="login" title="Login">
            <Form onSubmit={handleLogin}>
              {error && <Alert variant="danger">{error}</Alert>}
              {validationError && <Alert variant="warning">{validationError}</Alert>}
              
              <Form.Group className="mb-3">
                <Form.Label><FaEnvelope className="me-2" />Email</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label><FaLock className="me-2" />Password</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Button 
                variant="primary" 
                type="submit" 
                className="w-100"
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
              
              <div className="text-center mt-3">
                <small>Don't have an account? <Button variant="link" className="p-0" onClick={() => setActiveTab('register')}>Register</Button></small>
              </div>
            </Form>
          </Tab>
          
          <Tab eventKey="register" title="Register">
            <Form onSubmit={handleRegister}>
              {error && <Alert variant="danger">{error}</Alert>}
              {validationError && <Alert variant="warning">{validationError}</Alert>}
              
              <Form.Group className="mb-3">
                <Form.Label><FaEnvelope className="me-2" />Email</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label><FaLock className="me-2" />Password</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Form.Text className="text-muted">
                  Password must be at least 8 characters long
                </Form.Text>
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label><FaLock className="me-2" />Confirm Password</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Button 
                variant="primary" 
                type="submit" 
                className="w-100"
                disabled={isLoading}
              >
                {isLoading ? 'Registering...' : 'Register'}
              </Button>
              
              <div className="text-center mt-3">
                <small>Already have an account? <Button variant="link" className="p-0" onClick={() => setActiveTab('login')}>Login</Button></small>
              </div>
            </Form>
          </Tab>
        </Tabs>
        
        <Alert variant="info" className="mt-4">
          <small>
            <p className="mb-2">
              <strong>Why register an account?</strong>
            </p>
            <p className="mb-0">
              Creating an account will automatically set up a Stellar wallet for you on the Testnet with 10,000 XLM test tokens.
              This will allow you to buy, sell, and create NFTs on our platform.
            </p>
          </small>
        </Alert>
      </Card.Body>
    </Card>
  );
};

export default TraditionalAuth; 