import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { useWeb3Auth } from '../../contexts/Web3AuthContext';
import { useWalletConnect } from './WalletConnectProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import { toast } from 'react-toastify';

const NFTCreateForm = ({ onCreateSuccess, marketplace, ipfs }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [royalty, setRoyalty] = useState('');
  const [category, setCategory] = useState('');
  const [fileUrl, setFileUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  const web3Auth = useWeb3Auth();
  const walletConnect = useWalletConnect();
  
  // Combined check for wallet availability
  const isWalletAvailable = () => {
    return web3Auth.isLoggedIn || walletConnect.isConnected;
  };
  
  // Get the wallet address from either source
  const getWalletAddress = () => {
    if (web3Auth.isLoggedIn && web3Auth.stellarAccount) {
      return web3Auth.stellarAccount.publicKey;
    } else if (walletConnect.isConnected) {
      return walletConnect.publicKey;
    }
    return null;
  };
  
  // Get the signing method based on available wallet
  const getSignTransaction = async (xdr) => {
    if (web3Auth.isLoggedIn && web3Auth.stellarAccount) {
      // For Web3Auth, we can use the private key directly
      try {
        const keypair = StellarSdk.Keypair.fromSecret(web3Auth.stellarAccount.privateKey);
        const transaction = StellarSdk.TransactionBuilder.fromXDR(
          xdr,
          web3Auth.isLoggedIn ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC
        );
        
        transaction.sign(keypair);
        return transaction.toXDR();
      } catch (error) {
        console.error('Error signing with Web3Auth:', error);
        throw error;
      }
    } else if (walletConnect.isConnected) {
      // For WalletConnect, use the existing signing method
      return await walletConnect.signTransaction(xdr);
    }
    
    throw new Error('No wallet available for signing');
  };
  
  // Handle file change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileUrl(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };
  
  // Create NFT function
  const createNFT = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      
      // Validate inputs
      if (!name || !description || !price || !fileUrl) {
        throw new Error('Please fill in all required fields');
      }
      
      if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
        throw new Error('Price must be a positive number');
      }
      
      // Check if wallet is available
      if (!isWalletAvailable()) {
        setShowLoginModal(true);
        return;
      }
      
      const walletAddress = getWalletAddress();
      
      // Upload image to IPFS
      const formData = new FormData();
      formData.append('file', fileUrl);
      
      // Example IPFS upload - replace with your actual IPFS upload code
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }
      
      const { imageUrl, ipfsHash } = await uploadResponse.json();
      
      // Create metadata
      const metadata = {
        name,
        description,
        image: imageUrl,
        price: parseFloat(price),
        royalty: royalty ? parseFloat(royalty) : 0,
        category,
        creator: walletAddress,
        createdAt: new Date().toISOString()
      };
      
      // Upload metadata to IPFS
      const metadataResponse = await fetch('/api/metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      
      if (!metadataResponse.ok) {
        throw new Error('Failed to upload metadata');
      }
      
      const { metadataUrl, metadataHash } = await metadataResponse.json();
      
      // Get transaction XDR for creating the NFT
      const createNFTResponse = await fetch('/api/create-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          symbol: name.substring(0, 4).toUpperCase(),
          address: walletAddress,
          metadataUrl,
          supply: 1,
          price: parseFloat(price)
        })
      });
      
      if (!createNFTResponse.ok) {
        throw new Error('Failed to create NFT transaction');
      }
      
      const { xdr } = await createNFTResponse.json();
      
      // Sign the transaction
      const signedXdr = await getSignTransaction(xdr);
      
      // Submit the transaction
      const submitResponse = await fetch('/api/submit-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          xdr: signedXdr
        })
      });
      
      if (!submitResponse.ok) {
        throw new Error('Failed to submit transaction');
      }
      
      const result = await submitResponse.json();
      
      // Success notification
      toast.success('NFT created successfully!', { position: 'top-center' });
      
      // Reset form
      setName('');
      setDescription('');
      setPrice('');
      setRoyalty('');
      setCategory('');
      setFileUrl(null);
      setPreviewUrl('');
      
      // Call success callback
      if (onCreateSuccess) {
        onCreateSuccess(result);
      }
    } catch (error) {
      setError(error.message);
      toast.error(`Failed to create NFT: ${error.message}`, { position: 'top-center' });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card className="mb-4">
      <Card.Header>
        <h4 className="mb-0">Create New NFT</h4>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        <Form onSubmit={createNFT}>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>NFT Name *</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter a name for your NFT"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Description *</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="Describe your NFT"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Price (XLM) *</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  placeholder="Set a price in XLM"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Royalty % (Optional)</Form.Label>
                <Form.Control
                  type="number"
                  step="0.1"
                  placeholder="Royalty percentage for secondary sales"
                  value={royalty}
                  onChange={(e) => setRoyalty(e.target.value)}
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Category</Form.Label>
                <Form.Select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select a category</option>
                  <option value="art">Art</option>
                  <option value="collectibles">Collectibles</option>
                  <option value="photography">Photography</option>
                  <option value="music">Music</option>
                  <option value="gaming">Gaming</option>
                  <option value="other">Other</option>
                </Form.Select>
              </Form.Group>
            </Col>
            
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Upload File *</Form.Label>
                <Form.Control
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*,audio/*,video/*"
                  required={!fileUrl}
                />
                <Form.Text className="text-muted">
                  Supported formats: JPG, PNG, GIF, MP3, MP4, Max size: 50MB
                </Form.Text>
              </Form.Group>
              
              {previewUrl && (
                <div className="mt-3 text-center">
                  <p className="mb-2">Preview:</p>
                  <img
                    src={previewUrl}
                    alt="NFT Preview"
                    className="img-fluid"
                    style={{ maxHeight: '250px', borderRadius: '8px' }}
                  />
                </div>
              )}
              
              <div className="mt-4">
                <h5>Wallet Status</h5>
                {web3Auth.isLoggedIn ? (
                  <Alert variant="success">
                    Connected with Email/Google via Web3Auth
                  </Alert>
                ) : walletConnect.isConnected ? (
                  <Alert variant="success">
                    Connected with Stellar Wallet
                  </Alert>
                ) : (
                  <Alert variant="warning">
                    No wallet connected. You'll need to connect before creating your NFT.
                  </Alert>
                )}
              </div>
            </Col>
          </Row>
          
          <div className="d-flex gap-2 mt-4">
            <Button 
              variant="primary" 
              type="submit" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Creating...
                </>
              ) : (
                'Create NFT'
              )}
            </Button>
            <Button 
              variant="secondary" 
              type="button" 
              onClick={() => {
                setName('');
                setDescription('');
                setPrice('');
                setRoyalty('');
                setCategory('');
                setFileUrl(null);
                setPreviewUrl('');
              }}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default NFTCreateForm; 