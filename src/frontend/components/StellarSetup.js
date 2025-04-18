import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert } from 'react-bootstrap';
import { useStellarWallet } from './StellarWalletProvider';
import axios from 'axios';
import './StellarWallet.css';
import * as StellarSdk from '@stellar/stellar-sdk';

// Initialize Stellar server after importing the SDK
const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

export default function StellarSetup() {
  const { publicKey, isConnected, error, connectWallet, disconnectWallet, getAccountDetails, signTransaction } = useStellarWallet();
  const [activeTab, setActiveTab] = useState('setup');
  const [accountDetails, setAccountDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [nftForm, setNftForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    assetCode: ''
  });
  const [nftCreationStatus, setNftCreationStatus] = useState('');
  const [instructions, setInstructions] = useState([
    '1. Connect your Stellar wallet using the wallet connection above',
    '2. Make sure your wallet is funded with XLM (Stellar Lumens)',
    '3. You can create and manage NFTs once connected'
  ]);

  // Load account details when connected
  useEffect(() => {
    const loadAccountDetails = async () => {
      if (isConnected && publicKey) {
        try {
          setLoading(true);
          const account = await getAccountDetails();
          setAccountDetails(account);
        } catch (err) {
          console.error('Error loading account details:', err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadAccountDetails();
  }, [isConnected, publicKey, getAccountDetails]);

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNftForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Upload image to IPFS or local storage
  const uploadImage = async (file) => {
    // Direct hardcoded Pinata credentials - use for testing only
    const PINATA_API_KEY = 'c9588b8a340c881748d8';
    const PINATA_API_SECRET = '0dfd51d22c1641e149bc0acc4dc366592a84e2a94d6ab83645f9ca925d0e4ce4';
    
    try {
      console.log('Uploading image...');
      
      // Create a local URL first as a fallback
      const localUrl = URL.createObjectURL(file);
      
      // Try to upload to Pinata
      try {
        console.log('Attempting to upload to Pinata...');
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_API_SECRET
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        
        if (response.data && response.data.IpfsHash) {
          const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
          console.log('Successfully uploaded to IPFS:', ipfsUrl);
          return ipfsUrl;
        }
      } catch (error) {
        console.error('Failed to upload to Pinata:', error.message);
        console.log('Using local URL as fallback');
      }
      
      // Return local URL if Pinata upload fails
      return localUrl;
    } catch (error) {
      console.error('Error in uploadImage:', error);
      // Use object URL as fallback
      return URL.createObjectURL(file);
    }
  };

  // Create and store metadata
  const createMetadata = async (imageUrl) => {
    // Direct hardcoded Pinata credentials - use for testing only
    const PINATA_API_KEY = 'c9588b8a340c881748d8';
    const PINATA_API_SECRET = '0dfd51d22c1641e149bc0acc4dc366592a84e2a94d6ab83645f9ca925d0e4ce4';
    
    try {
      const metadata = {
        name: nftForm.name,
        description: nftForm.description,
        image: imageUrl,
        creator: publicKey,
        created_at: new Date().toISOString()
      };
      
      console.log('Created metadata:', metadata);
      
      // Try to upload to Pinata
      try {
        console.log('Attempting to upload metadata to Pinata...');
        const response = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_API_SECRET
          }
        });
        
        if (response.data && response.data.IpfsHash) {
          const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
          console.log('Successfully uploaded metadata to IPFS:', metadataUrl);
          return metadataUrl;
        }
      } catch (error) {
        console.error('Failed to upload metadata to Pinata:', error.message);
      }
      
      // If Pinata upload fails, use a simplified approach - return just the image URL
      console.log('Using image URL directly as fallback');
      return imageUrl;
    } catch (error) {
      console.error('Error in createMetadata:', error);
      return imageUrl; // Fallback to just using the image URL
    }
  };

  // Create NFT Asset
  const createNFTAsset = async (e) => {
    e.preventDefault();
    if (!isConnected) {
      setNftCreationStatus('Please connect your wallet first');
      return;
    }

    if (!selectedFile) {
      setNftCreationStatus('Please select an image file');
      return;
    }

    if (!nftForm.assetCode || nftForm.assetCode.length < 1 || nftForm.assetCode.length > 12) {
      setNftCreationStatus('Asset code must be between 1 and 12 characters');
      return;
    }

    try {
      setLoading(true);
      setNftCreationStatus('Creating NFT...');

      // Get the source keypair
      const sourceSecretKey = localStorage.getItem('stellarSecretKey');
      if (!sourceSecretKey) {
        throw new Error('Secret key not found. Please reconnect your wallet.');
      }
      
      const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
      const sourcePublicKey = sourceKeypair.publicKey();
      
      console.log('Creating NFT with keypair:', {
        publicKey: sourcePublicKey,
        // Don't log the full secret key
        secretKey: sourceSecretKey.substring(0, 5) + '...'
      });
      
      // Check if account exists
      try {
        setNftCreationStatus('Checking account...');
        await server.loadAccount(sourcePublicKey);
        console.log('Account exists on the network');
      } catch (accountError) {
        console.error('Account does not exist:', accountError);
        setNftCreationStatus('Account not found. Attempting to fund with Friendbot...');
        
        // Fund the account using Friendbot
        try {
          const response = await axios.get(`https://friendbot.stellar.org?addr=${sourcePublicKey}`);
          console.log('Friendbot response:', response.data);
          setNftCreationStatus('Account funded! Continuing with NFT creation...');
        } catch (fundError) {
          console.error('Failed to fund account:', fundError);
          throw new Error('Failed to create account. Please fund your account with XLM first.');
        }
      }
      
      // Load the account again now that it should exist
      const sourceAccount = await server.loadAccount(sourcePublicKey);
      console.log('Loaded account with sequence:', sourceAccount.sequence);

      // Upload the image
      setNftCreationStatus('Uploading image...');
      const imageUrl = await uploadImage(selectedFile);
      console.log('Image uploaded to:', imageUrl);
      
      // Create and store metadata
      setNftCreationStatus('Creating metadata...');
      
      // Create a simple metadata string to avoid hitting the 64-byte limit
      const metadataStr = `Name: ${nftForm.name}, URL: ${imageUrl}`;
      console.log('Metadata string (length: ' + metadataStr.length + '):', metadataStr);
      
      // Make sure it's not too long
      const finalMetadata = metadataStr.length <= 64 ? metadataStr : metadataStr.substring(0, 64);
      console.log('Final metadata to store (length: ' + finalMetadata.length + '):', finalMetadata);
      
      setNftCreationStatus('Creating Stellar asset...');

      // Validate the asset code (alphanumeric only)
      const assetCode = nftForm.assetCode.replace(/[^a-zA-Z0-9]/g, '');
      console.log('Using asset code:', assetCode);
      
      // Create the NFT asset
      const asset = new StellarSdk.Asset(assetCode, sourcePublicKey);

      // Build the transaction
      setNftCreationStatus('Building transaction...');
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET
      })
        .addOperation(StellarSdk.Operation.manageData({
          name: `nft_${assetCode}_metadata`,
          value: finalMetadata
        }))
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: asset,
          limit: '1' // Set limit to 1 for NFT
        }))
        .setTimeout(30)
        .build();

      // Sign the transaction
      setNftCreationStatus('Signing transaction...');
      transaction.sign(sourceKeypair);
      
      // Convert transaction to XDR for debugging
      const xdr = transaction.toXDR();
      console.log('Transaction XDR:', xdr);
      
      // Submit the transaction
      setNftCreationStatus('Submitting transaction...');
      try {
        const txResult = await server.submitTransaction(transaction);
        console.log('Transaction successful:', txResult);

        setNftCreationStatus('NFT created successfully!');
        
        // Reset form
        setNftForm({
          name: '',
          description: '',
          imageUrl: '',
          assetCode: ''
        });
        setSelectedFile(null);
        setPreviewUrl('');

        // Show success message
        alert('NFT created successfully!');
      } catch (submitError) {
        console.error('Transaction submission error:', submitError.response?.data || submitError);
        if (submitError.response?.data?.extras?.result_codes) {
          const resultCodes = submitError.response.data.extras.result_codes;
          console.error('Result codes:', resultCodes);
          throw new Error(`Transaction failed: ${JSON.stringify(resultCodes)}`);
        } else {
          throw submitError;
        }
      }
    } catch (err) {
      console.error('Error creating NFT:', err);
      setNftCreationStatus(`Failed to create NFT: ${err.message}`);
      alert(`Failed to create NFT: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <Card>
            <Card.Header>
              <nav>
                <Button
                  variant={activeTab === 'setup' ? 'primary' : 'light'}
                  onClick={() => setActiveTab('setup')}
                  className="me-2"
                >
                  Setup Instructions
                </Button>
                <Button
                  variant={activeTab === 'create' ? 'primary' : 'light'}
                  onClick={() => setActiveTab('create')}
                >
                  Create NFT
                </Button>
              </nav>
            </Card.Header>
            <Card.Body>
              {activeTab === 'setup' ? (
                <div>
                  <h4>Setup Instructions</h4>
                  <ul>
                    {instructions.map((instruction, index) => (
                      <li key={index}>{instruction}</li>
                    ))}
                  </ul>
                  {error && <Alert variant="danger">{error}</Alert>}
                  {accountDetails && (
                    <div>
                      <h5>Account Details</h5>
                      <p>Account ID: {accountDetails.id}</p>
                      <p>Sequence: {accountDetails.sequence}</p>
                      <h6>Balances:</h6>
                      <ul>
                        {accountDetails.balances.map((balance, index) => (
                          <li key={index}>
                            {balance.asset_type === 'native' 
                              ? `XLM: ${balance.balance}`
                              : `${balance.asset_code}: ${balance.balance}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h4>Create NFT</h4>
                  <Form onSubmit={createNFTAsset}>
                    <Form.Group className="mb-3">
                      <Form.Label>NFT Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="name"
                        value={nftForm.name}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Description</Form.Label>
                      <Form.Control
                        as="textarea"
                        name="description"
                        value={nftForm.description}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Upload Image</Form.Label>
                      <div className="d-flex align-items-center gap-3">
                        <input
                          type="file"
                          name="nftImage"
                          id="nftImage"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="d-none"
                          required
                        />
                        <Button 
                          variant="outline-primary" 
                          onClick={() => document.getElementById('nftImage').click()}
                        >
                          Choose Image
                        </Button>
                        {selectedFile && (
                          <span className="text-muted">
                            {selectedFile.name}
                          </span>
                        )}
                      </div>
                      {previewUrl && (
                        <div className="mt-3">
                          <img 
                            src={previewUrl} 
                            alt="Preview" 
                            style={{ 
                              maxWidth: '200px', 
                              maxHeight: '200px', 
                              objectFit: 'contain',
                              border: '1px solid #dee2e6',
                              borderRadius: '4px',
                              padding: '4px'
                            }} 
                          />
                        </div>
                      )}
                      {!selectedFile && (
                        <Form.Text className="text-muted">
                          Please select an image file for your NFT
                        </Form.Text>
                      )}
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Asset Code (max 12 characters)</Form.Label>
                      <Form.Control
                        type="text"
                        name="assetCode"
                        value={nftForm.assetCode}
                        onChange={handleInputChange}
                        maxLength={12}
                        required
                      />
                    </Form.Group>
                    <Button type="submit" disabled={loading || !isConnected}>
                      {loading ? 'Creating...' : 'Create NFT'}
                    </Button>
                  </Form>
                  {nftCreationStatus && (
                    <Alert variant={nftCreationStatus.includes('Failed') ? 'danger' : 'success'} className="mt-3">
                      {nftCreationStatus}
                    </Alert>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
} 