import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Alert, Spinner, Tabs, Tab, InputGroup } from 'react-bootstrap';
import * as StellarSdk from '@stellar/stellar-sdk';
import { useWalletConnect } from './WalletConnectProvider';
import { useWeb3Auth } from './Web3AuthProvider';
import axios from 'axios';
import './Create.css';
import { toast } from 'react-hot-toast';
import BidService from './BidService';
import AuctionService from './AuctionService';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import PayWithMoonpay from './PayWithMoonpay';
import { useStellarWallet } from '../../contexts/StellarWalletContext';

const Create = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, signAndSubmitTransaction } = useWalletConnect();
  const { 
    stellarKeypair, 
    stellarPublicKey, 
    stellarAccountExists, 
    isConnected: isWeb3AuthConnected,
    isFunding,
    error: stellarError
  } = useWeb3Auth();
  const { isConnected: stellarWalletConnected } = useStellarWallet();

  const [formInput, setFormInput] = useState({
    price: '',
    name: '',
    description: '',
    assetCode: '',
    minimumBid: '',
    auctionEndDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [activeTab, setActiveTab] = useState('fixed-price');
  const [showMoonpayButton, setShowMoonpayButton] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isMinting, setIsMinting] = useState(false);

  // Clear error messages when component mounts
  useEffect(() => {
    setErrorMsg('');
    setStatusMsg('');
  }, []);

  // Handle Stellar wallet errors
  useEffect(() => {
    if (stellarError) {
      setErrorMsg(`Stellar Wallet Error: ${stellarError}`);
    }
  }, [stellarError]);

  // Show appropriate status messages
  useEffect(() => {
    if (isFunding) {
      setStatusMsg('Funding your Stellar account with test XLM...');
    } else if (isUploading) {
      setStatusMsg('Uploading artwork to IPFS...');
    } else if (isMinting) {
      setStatusMsg('Minting your NFT...');
    } else {
      setStatusMsg('');
    }
  }, [isFunding, isUploading, isMinting]);

  // Validate wallet state before any NFT creation
  const validateWalletState = () => {
    if (!isConnected && !isWeb3AuthConnected) {
      throw new Error('Please connect your wallet to create an NFT');
    }

    if (isWeb3AuthConnected) {
      if (!stellarAccountExists) {
        throw new Error('Your Stellar account is not ready yet. Please wait...');
      }
      if (isFunding) {
        throw new Error('Your Stellar account is being funded. Please wait...');
      }
    }
  };

  // Create Fixed Price NFT
  const createNFT = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate wallet state
      validateWalletState();

      // Validate form inputs
      const { name, description, price, assetCode } = formInput;
      if (!name || !description || !price || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }

      // Rest of your existing createNFT logic
      // ...

    } catch (error) {
      console.error('Error creating NFT:', error);
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Create Open Bid NFT
  const createOpenBidNFT = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate wallet state
      validateWalletState();

      // Validate form inputs
      const { name, description, minimumBid, assetCode } = formInput;
      if (!name || !description || !minimumBid || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }

      // Rest of your existing createOpenBidNFT logic
      // ...

    } catch (error) {
      console.error('Error creating open bid NFT:', error);
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Create Timed Auction NFT
  const createTimedAuctionNFT = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate wallet state
      validateWalletState();

      // Validate form inputs
      const { name, description, price, assetCode, auctionEndDate } = formInput;
      if (!name || !description || !price || !assetCode || !selectedFile || !auctionEndDate) {
        throw new Error('Please fill all fields and select an image');
      }

      // Rest of your existing createTimedAuctionNFT logic
      // ...

    } catch (error) {
      console.error('Error creating timed auction NFT:', error);
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoonpaySuccess = () => {
    setShowMoonpayButton(false);
    setStatusMsg('Payment successful! Creating your NFT...');
    createNFT();
  };

  const handleCreateWithPayment = () => {
    if (!formInput.price) {
      setErrorMsg('Please enter a price for the NFT');
      return;
    }
    setPaymentAmount(formInput.price);
    setShowMoonpayButton(true);
  };

  return (
    <div className="create-nft-container">
      <Container className="create-nft-content">
        <Row>
          <Col md={7} className="create-nft-form">
            <h1>Create New NFT</h1>

            {/* Wallet Connection Status */}
            {!isConnected && !isWeb3AuthConnected && (
              <Alert variant="warning">
                Please connect your wallet to create an NFT
              </Alert>
            )}

            {/* Stellar Account Status */}
            {isFunding && (
              <Alert variant="info">
                <Spinner animation="border" size="sm" className="me-2" />
                Funding your Stellar account with test XLM...
              </Alert>
            )}

            {isWeb3AuthConnected && !isConnected && !isFunding && (
              <Alert variant="warning">
                <Spinner animation="border" size="sm" className="me-2" />
                Your Stellar account is being created. Please wait...
              </Alert>
            )}

            {/* Error and Status Messages */}
            {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}
            {statusMsg && <Alert variant="info">{statusMsg}</Alert>}

            {/* NFT Creation Form */}
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>NFT Name</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter NFT name"
                  value={formInput.name}
                  onChange={(e) => setFormInput({ ...formInput, name: e.target.value })}
                  disabled={isLoading || !stellarAccountExists}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="Enter NFT description"
                  value={formInput.description}
                  onChange={(e) => setFormInput({ ...formInput, description: e.target.value })}
                  disabled={isLoading || !stellarAccountExists}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Asset Code</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter asset code (e.g., MYNFT)"
                  value={formInput.assetCode}
                  onChange={(e) => setFormInput({ ...formInput, assetCode: e.target.value })}
                  disabled={isLoading || !stellarAccountExists}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Upload Image</Form.Label>
                <div className="d-flex align-items-center gap-3">
                  <Button
                    variant="outline-primary"
                    onClick={() => document.getElementById('fileInput').click()}
                    disabled={isLoading || !stellarAccountExists}
                  >
                    Choose File
                  </Button>
                  <input
                    type="file"
                    id="fileInput"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept="image/*"
                  />
                  {selectedFile && <span>{selectedFile.name}</span>}
                </div>
              </Form.Group>

              <Tabs
                activeKey={activeTab}
                onSelect={(k) => setActiveTab(k)}
                className="mb-3"
              >
                {/* Fixed Price Tab */}
                <Tab eventKey="fixed-price" title="Fixed Price">
                  <Form.Group className="mb-3">
                    <Form.Label>Price (XLM)</Form.Label>
                    <Form.Control
                      type="number"
                      placeholder="Enter price in XLM"
                      value={formInput.price}
                      onChange={(e) => setFormInput({ ...formInput, price: e.target.value })}
                      disabled={isLoading || !stellarAccountExists}
                    />
                  </Form.Group>

                  {showMoonpayButton ? (
                    <PayWithMoonpay 
                      amount={paymentAmount} 
                      onSuccess={handleMoonpaySuccess}
                    />
                  ) : (
                    <Button
                      onClick={handleCreateWithPayment}
                      disabled={
                        isLoading ||
                        !formInput.name ||
                        !formInput.description ||
                        !formInput.price ||
                        !formInput.assetCode ||
                        !selectedFile ||
                        !stellarAccountExists ||
                        isFunding
                      }
                      className="w-100"
                    >
                      {isLoading ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Creating...
                        </>
                      ) : (
                        'Create Fixed Price NFT'
                      )}
                    </Button>
                  )}
                </Tab>

                {/* Open for Bids Tab */}
                <Tab eventKey="open-for-bids" title="Open for Bids">
                  <Form.Group className="mb-3">
                    <Form.Label>Minimum Bid (XLM)</Form.Label>
                    <Form.Control
                      type="number"
                      placeholder="Enter minimum bid in XLM"
                      value={formInput.minimumBid}
                      onChange={(e) => setFormInput({ ...formInput, minimumBid: e.target.value })}
                      disabled={isLoading || !stellarAccountExists}
                    />
                  </Form.Group>
                  <Button
                    onClick={createOpenBidNFT}
                    disabled={
                      isLoading ||
                      !formInput.name ||
                      !formInput.description ||
                      !formInput.minimumBid ||
                      !formInput.assetCode ||
                      !selectedFile ||
                      !stellarAccountExists ||
                      isFunding
                    }
                    className="w-100"
                  >
                    {isLoading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Creating...
                      </>
                    ) : (
                      'Create Open Bid NFT'
                    )}
                  </Button>
                </Tab>

                {/* Timed Auction Tab */}
                <Tab eventKey="timed-auction" title="Timed Auction">
                  <Form.Group className="mb-3">
                    <Form.Label>Starting Price (XLM)</Form.Label>
                    <Form.Control
                      type="number"
                      placeholder="Enter starting price in XLM"
                      value={formInput.price}
                      onChange={(e) => setFormInput({ ...formInput, price: e.target.value })}
                      disabled={isLoading || !stellarAccountExists}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Auction End Date</Form.Label>
                    <DatePicker
                      selected={formInput.auctionEndDate}
                      onChange={(date) => setFormInput({ ...formInput, auctionEndDate: date })}
                      showTimeSelect
                      dateFormat="Pp"
                      minDate={new Date()}
                      className="form-control"
                      disabled={isLoading || !stellarAccountExists}
                    />
                  </Form.Group>
                  <Button
                    onClick={createTimedAuctionNFT}
                    disabled={
                      isLoading ||
                      !formInput.name ||
                      !formInput.description ||
                      !formInput.price ||
                      !formInput.assetCode ||
                      !formInput.auctionEndDate ||
                      !selectedFile ||
                      !stellarAccountExists ||
                      isFunding
                    }
                    className="w-100"
                  >
                    {isLoading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Creating...
                      </>
                    ) : (
                      'Create Timed Auction NFT'
                    )}
                  </Button>
                </Tab>
              </Tabs>
            </Form>
          </Col>

          {/* Preview Column */}
          <Col md={5} className="create-nft-preview">
            {previewUrl && (
              <div className="preview-container">
                <img src={previewUrl} alt="NFT Preview" className="preview-image" />
              </div>
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Create; 