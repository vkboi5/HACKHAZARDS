import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import * as StellarSdk from '@stellar/stellar-sdk';
import { useStellarWallet } from './StellarWalletProvider';
import axios from 'axios';
import './Create.css';

const Create = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected } = useStellarWallet();
  const [formInput, setFormInput] = useState({
    price: '',
    name: '',
    description: '',
    assetCode: '',
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

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

  // Upload image to IPFS via Pinata
  const uploadImage = async (file) => {
    // Direct hardcoded Pinata credentials - use for testing only
    const PINATA_API_KEY = 'c9588b8a340c881748d8';
    const PINATA_API_SECRET = '0dfd51d22c1641e149bc0acc4dc366592a84e2a94d6ab83645f9ca925d0e4ce4';
    
    try {
      setStatusMsg('Uploading image...');
      
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

  // Upload metadata to IPFS via Pinata
  const uploadMetadata = async (metadata) => {
    // Direct hardcoded Pinata credentials - use for testing only
    const PINATA_API_KEY = 'c9588b8a340c881748d8';
    const PINATA_API_SECRET = '0dfd51d22c1641e149bc0acc4dc366592a84e2a94d6ab83645f9ca925d0e4ce4';
    
    try {
      setStatusMsg('Uploading metadata...');
      console.log('Uploading metadata to Pinata...');
      
      const response = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET
        }
      });

      if (response.data && response.data.IpfsHash) {
        const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
        console.log('Metadata URL:', metadataUrl);
        return metadataUrl;
      }
      
      throw new Error('No IPFS hash returned from Pinata');
    } catch (error) {
      console.error('Error uploading metadata:', error);
      throw error;
    }
  };

  async function createNFT() {
    const { name, description, price, assetCode } = formInput;
    
    // Form validation
    if (!name || !description || !price || !selectedFile) {
      setErrorMsg('Please fill all fields and select an image');
      return;
    }
    
    if (!assetCode || assetCode.length < 1 || assetCode.length > 12) {
      setErrorMsg('Asset code must be between 1 and 12 characters');
      return;
    }
    
    if (!isConnected) {
      setErrorMsg('Please connect your Stellar wallet first');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    
    try {
      // Upload image to IPFS
      const imageUrl = await uploadImage(selectedFile);
      setFileUrl(imageUrl);
      
      // Create metadata
      const metadata = {
        name,
        description,
        image: imageUrl,
        price,
        creator: publicKey,
        created_at: new Date().toISOString()
      };

      // Upload metadata to IPFS
      const metadataUrl = await uploadMetadata(metadata);
      
      // Create NFT on Stellar
      setStatusMsg('Creating NFT on Stellar...');
      
      // Get the source keypair from localStorage
      const sourceSecretKey = localStorage.getItem('stellarSecretKey');
      if (!sourceSecretKey) {
        throw new Error('Secret key not found. Please reconnect your wallet.');
      }
      
      const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
      const sourcePublicKey = sourceKeypair.publicKey();
      
      // Validate the asset code (alphanumeric only)
      const validAssetCode = assetCode.replace(/[^a-zA-Z0-9]/g, '');
      
      // Initialize Stellar server
      const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
      
      // Check if account exists
      try {
        await server.loadAccount(sourcePublicKey);
      } catch (accountError) {
        setStatusMsg('Account not found. Attempting to fund with Friendbot...');
        
        // Fund the account using Friendbot
        try {
          await axios.get(`https://friendbot.stellar.org?addr=${sourcePublicKey}`);
          setStatusMsg('Account funded! Continuing with NFT creation...');
        } catch (fundError) {
          throw new Error('Failed to create account. Please fund your account with XLM first.');
        }
      }
      
      // Load the account again now that it should exist
      const account = await server.loadAccount(sourcePublicKey);
      
      // Create the NFT asset
      const asset = new StellarSdk.Asset(validAssetCode, sourcePublicKey);
      
      // Create and sign transaction
      setStatusMsg('Creating and signing transaction...');
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET
      })
        .addOperation(StellarSdk.Operation.manageData({
          name: `nft_${validAssetCode}_metadata`,
          value: metadataUrl.length <= 64 ? metadataUrl : metadataUrl.substring(0, 64)
        }))
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: asset,
          limit: '1' // Set limit to 1 for NFT
        }))
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      
      // Submit transaction
      setStatusMsg('Submitting transaction...');
      await server.submitTransaction(transaction);
      
      setStatusMsg('NFT created successfully!');
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error) {
      console.error('Error creating NFT: ', error);
      setErrorMsg(`Error creating NFT: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="create-nft-container">
      <Container className="create-nft-content">
        <Row>
          <Col md={7} className="create-nft-form">
            <h1>Create New NFT</h1>
            
            {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}
            {statusMsg && <Alert variant="info">{statusMsg}</Alert>}
            
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>NFT Name</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="NFT Name"
                  onChange={e => setFormInput({ ...formInput, name: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="NFT Description"
                  onChange={e => setFormInput({ ...formInput, description: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Price (XLM)</Form.Label>
                <Form.Control
                  type="number"
                  placeholder="NFT Price in XLM"
                  onChange={e => setFormInput({ ...formInput, price: e.target.value })}
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Asset Code (max 12 characters)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Asset Code (e.g., MYNFT)"
                  maxLength={12}
                  onChange={e => setFormInput({ ...formInput, assetCode: e.target.value })}
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
                {!selectedFile && (
                  <Form.Text className="text-muted">
                    Please select an image file for your NFT
                  </Form.Text>
                )}
              </Form.Group>

              <Button
                onClick={createNFT}
                disabled={isLoading || !formInput.name || !formInput.description || !formInput.price || !formInput.assetCode || !selectedFile}
              >
                {isLoading ? 'Creating...' : 'Create NFT'}
              </Button>
            </Form>
          </Col>

          <Col md={5} className="create-nft-preview">
            <div className="preview-container">
              <h2>Preview</h2>
              <div className="image-preview">
                {previewUrl ? (
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className="preview-image"
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '300px', 
                      objectFit: 'contain',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      padding: '4px'
                    }}
                  />
                ) : (
                  <p>No image uploaded</p>
                )}
              </div>
              <div className="preview-details">
                <h3>{formInput.name || 'NFT Name'}</h3>
                <p>{formInput.description || 'NFT Description'}</p>
                <p className="price">{formInput.price ? `${formInput.price} XLM` : '0 XLM'}</p>
                {formInput.assetCode && <p className="asset-code">Asset Code: {formInput.assetCode}</p>}
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Create;  