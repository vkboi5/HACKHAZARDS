import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import * as StellarSdk from '@stellar/stellar-sdk';
import { useWalletConnect } from './WalletConnectProvider';
import * as freighterApi from '@stellar/freighter-api';
import axios from 'axios';
import './Create.css';
import { toast } from 'react-hot-toast';

const Create = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, signAndSubmitTransaction } = useWalletConnect();
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
  const [pinataConfig, setPinataConfig] = useState({
    apiKey: process.env.REACT_APP_PINATA_API_KEY,
    apiSecret: process.env.REACT_APP_PINATA_API_SECRET,
    gateway: process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/',
    timeout: 60000 // 60 seconds timeout
  });
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);

  // Verify environment variables on component mount
  useEffect(() => {
    const missingVars = [];
    
    if (!process.env.REACT_APP_PINATA_API_KEY) missingVars.push('REACT_APP_PINATA_API_KEY');
    if (!process.env.REACT_APP_PINATA_API_SECRET) missingVars.push('REACT_APP_PINATA_API_SECRET');
    if (!process.env.REACT_APP_IPFS_GATEWAY) missingVars.push('REACT_APP_IPFS_GATEWAY');
    if (!process.env.REACT_APP_STELLAR_NETWORK) missingVars.push('REACT_APP_STELLAR_NETWORK');
    if (!process.env.REACT_APP_HORIZON_URL) missingVars.push('REACT_APP_HORIZON_URL');
    
    if (missingVars.length > 0) {
      const errorMessage = `Missing environment variables: ${missingVars.join(', ')}. Please check your .env file.`;
      console.error(errorMessage);
      setErrorMsg(errorMessage);
    } else {
      setEnvVarsLoaded(true);
      console.log('Environment variables loaded successfully');
    }
  }, []);

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Check Pinata credentials
  useEffect(() => {
    if (!envVarsLoaded) return;
    
    if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
      console.warn('Pinata API credentials not found in environment variables.');
      setErrorMsg('Warning: IPFS configuration missing.');
      return;
    }
    
    if (pinataConfig.apiKey === 'your-pinata-api-key' || 
        pinataConfig.apiSecret === 'your-pinata-api-secret') {
      setErrorMsg(
        'Warning: Using placeholder Pinata API keys.\n' +
        '1. Sign up at https://app.pinata.cloud\n' +
        '2. Create an API key with "Admin" permissions\n' +
        '3. Update your .env file\n' +
        '4. Restart your development server'
      );
      return;
    } else if (pinataConfig.apiKey.length < 10 || pinataConfig.apiSecret.length < 20) {
      setErrorMsg('Warning: Invalid Pinata API keys.');
      return;
    }
    
    const validatePinataCredentials = async () => {
      try {
        setStatusMsg('Verifying Pinata credentials...');
        const response = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
          headers: {
            'pinata_api_key': pinataConfig.apiKey,
            'pinata_secret_api_key': pinataConfig.apiSecret
          }
        });
        
        if (response.status === 200) {
          console.log('Pinata credentials validated successfully');
          setStatusMsg('Pinata connection established');
          setTimeout(() => setStatusMsg(''), 3000);
        }
      } catch (error) {
        console.error('Pinata credential validation failed:', error);
        setErrorMsg('Error: Invalid Pinata credentials.');
      }
    };
    
    validatePinataCredentials();
  }, [envVarsLoaded]);

  useEffect(() => {
    if (errorMsg && errorMsg.includes('Pinata')) {
      console.info('To fix Pinata issues:');
      console.info('1. Create an account at https://app.pinata.cloud');
      console.info('2. Generate API keys at https://app.pinata.cloud/keys');
      console.info('3. Add keys to .env file');
      console.info('4. Restart the development server');
    }
  }, [errorMsg]);

  const uploadImage = async (file, maxRetries = 3, retryDelay = 2000) => {
    try {
      setStatusMsg('Preparing image upload...');
      console.log(`Image file: ${file.name}, type: ${file.type}, size: ${file.size / 1024} KB`);
      
      const localUrl = URL.createObjectURL(file);
      
      if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
        setStatusMsg('IPFS configuration missing. Using local storage.');
        console.warn('Pinata credentials missing.');
        return { url: localUrl, source: 'local', success: false };
      }
      
      const maxFileSizeMB = 100;
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxFileSizeMB) {
        const errorMsg = `File size (${fileSizeMB.toFixed(2)}MB) exceeds ${maxFileSizeMB}MB.`;
        console.error(errorMsg);
        setStatusMsg(`${errorMsg} Using local storage.`);
        return { url: localUrl, source: 'local', success: false };
      }
      
      let retryCount = 0;
      let lastError = null;
      
      while (retryCount <= maxRetries) {
        try {
          setStatusMsg(`Uploading image to IPFS (${retryCount > 0 ? `retry ${retryCount}/${maxRetries}` : 'first attempt'})...`);
          console.log(`Attempting Pinata upload (attempt ${retryCount + 1})...`);
          
          const formData = new FormData();
          formData.append('file', file);
          
          const metadata = JSON.stringify({
            name: file.name,
            keyvalues: {
              app: 'Galerie',
              timestamp: new Date().toISOString(),
              version: process.env.REACT_APP_VERSION || '1.0.0'
            }
          });
          formData.append('pinataMetadata', metadata);
          
          const pinataOptions = JSON.stringify({
            cidVersion: 1,
            wrapWithDirectory: false
          });
          formData.append('pinataOptions', pinataOptions);
          
          console.log('Request headers:', {
            'Content-Type': 'multipart/form-data',
            'pinata_api_key': `${pinataConfig.apiKey.substring(0, 3)}...`,
            'pinata_secret_api_key': '*** REDACTED ***'
          });
          
          const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS', 
            formData, 
            {
              headers: {
                'Content-Type': 'multipart/form-data',
                'pinata_api_key': pinataConfig.apiKey,
                'pinata_secret_api_key': pinataConfig.apiSecret
              },
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              timeout: pinataConfig.timeout
            }
          );
          
          console.log('Pinata upload response status:', response.status);
          
          if (response.data && response.data.IpfsHash) {
            const ipfsUrl = `${pinataConfig.gateway}${response.data.IpfsHash}`;
            console.log('Uploaded to IPFS:', ipfsUrl);
            setStatusMsg('Image uploaded to IPFS successfully!');
            return { url: ipfsUrl, source: 'ipfs', hash: response.data.IpfsHash, success: true };
          } else {
            throw new Error('No IPFS hash returned');
          }
        } catch (error) {
          lastError = error;
          let errorMessage = 'Failed to upload to Pinata';
          let shouldRetry = true;
          
          if (error.code === 'ECONNABORTED') {
            errorMessage = 'Pinata upload timed out.';
          } else if (error.response) {
            const statusCode = error.response.status;
            const responseBody = error.response.data || {};
            errorMessage = `Pinata error (${statusCode}): ${responseBody.message || 'Unknown error'}`;
            if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
              shouldRetry = false;
            }
            if (statusCode === 401) {
              errorMessage = 'Authentication failed. Check Pinata API keys.';
              shouldRetry = false;
            } else if (statusCode === 429) {
              errorMessage = 'Rate limit exceeded. Waiting.';
              await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
            }
          } else if (error.request) {
            errorMessage = 'No response from Pinata servers.';
          }
          
          console.error(`${errorMessage} (Attempt ${retryCount + 1}/${maxRetries + 1})`, error);
          
          if (!shouldRetry || retryCount >= maxRetries) {
            break;
          }
          
          retryCount++;
          setStatusMsg(`${errorMessage} Retrying... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      const finalErrorMsg = `Failed to upload to IPFS after ${maxRetries + 1} attempts.`;
      console.error(finalErrorMsg, lastError);
      setStatusMsg(finalErrorMsg);
      return { url: localUrl, source: 'local', success: false, error: lastError?.message };
    } catch (error) {
      const errorMsg = `Error in uploadImage: ${error.message}`;
      console.error(errorMsg, error);
      setStatusMsg('Error processing image. Using local storage.');
      return { 
        url: URL.createObjectURL(file), 
        source: 'local', 
        success: false, 
        error: error.message 
      };
    }
  };

  const uploadMetadata = async (metadata, maxRetries = 3, retryDelay = 2000) => {
    try {
      setStatusMsg('Preparing metadata upload...');
      console.log('Metadata prepared:', {
        name: metadata.name,
        description: `${metadata.description?.substring(0, 20)}...`,
        hasImage: !!metadata.image
      });
      
      const createLocalFallback = () => {
        const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
        return URL.createObjectURL(blob);
      };
      
      if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
        setStatusMsg('IPFS configuration missing.');
        console.warn('Pinata credentials missing.');
        if (process.env.NODE_ENV === 'development') {
          const localUrl = createLocalFallback();
          console.warn('Using local storage in development mode');
          return { url: localUrl, source: 'local', success: false };
        }
        throw new Error('Pinata API credentials not configured.');
      }
      
      let retryCount = 0;
      let lastError = null;
      
      while (retryCount <= maxRetries) {
        try {
          setStatusMsg(`Uploading metadata to IPFS (${retryCount > 0 ? `retry ${retryCount}/${maxRetries}` : 'first attempt'})...`);
          console.log(`Attempting metadata upload (attempt ${retryCount + 1})...`);
          
          const pinataMetadata = {
            name: `NFT Metadata - ${metadata.name}`,
            keyvalues: {
              app: 'Galerie',
              creator: metadata.creator?.substring(0, 10) || 'unknown',
              timestamp: new Date().toISOString(),
              version: process.env.REACT_APP_VERSION || '1.0.0'
            }
          };
          
          const pinataOptions = {
            cidVersion: 1
          };
          
          const data = {
            pinataMetadata,
            pinataOptions,
            pinataContent: metadata
          };
          
          console.log('Metadata request:', {
            url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            contentSize: JSON.stringify(metadata).length,
            pinataMetadata
          });
          
          const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinJSONToIPFS', 
            data,
            {
              headers: {
                'Content-Type': 'application/json',
                'pinata_api_key': pinataConfig.apiKey,
                'pinata_secret_api_key': pinataConfig.apiSecret
              },
              timeout: pinataConfig.timeout
            }
          );
          
          console.log('Pinata metadata upload response status:', response.status);
          
          if (response.data && response.data.IpfsHash) {
            const metadataUrl = `${pinataConfig.gateway}${response.data.IpfsHash}`;
            console.log('Metadata uploaded to IPFS:', metadataUrl);
            setStatusMsg('Metadata uploaded to IPFS successfully!');
            return { url: metadataUrl, source: 'ipfs', hash: response.data.IpfsHash, success: true };
          } else {
            throw new Error('No IPFS hash returned for metadata');
          }
        } catch (error) {
          lastError = error;
          let errorMessage = 'Failed to upload metadata to Pinata';
          let shouldRetry = true;
          
          if (error.code === 'ECONNABORTED') {
            errorMessage = 'Metadata upload timed out.';
          } else if (error.response) {
            const statusCode = error.response.status;
            const responseBody = error.response.data || {};
            errorMessage = `Pinata metadata error (${statusCode}): ${responseBody.message || 'Unknown error'}`;
            if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
              shouldRetry = false;
            }
            if (statusCode === 401) {
              errorMessage = 'Authentication failed for metadata.';
              shouldRetry = false;
            } else if (statusCode === 429) {
              errorMessage = 'Rate limit exceeded for metadata.';
              await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
            }
          } else if (error.request) {
            errorMessage = 'No response from Pinata servers for metadata.';
          }
          
          console.error(`${errorMessage} (Attempt ${retryCount + 1}/${maxRetries + 1})`, error);
          
          if (!shouldRetry || retryCount >= maxRetries) {
            break;
          }
          
          retryCount++;
          setStatusMsg(`${errorMessage} Retrying metadata upload... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      const finalErrorMsg = `Failed to upload metadata to IPFS after ${maxRetries + 1} attempts.`;
      console.error(finalErrorMsg, lastError);
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using local storage for metadata in development mode');
        const localUrl = createLocalFallback();
        setStatusMsg(`${finalErrorMsg} Using temporary storage.`);
        return { url: localUrl, source: 'local', success: false, error: lastError?.message };
      }
      
      setStatusMsg(`${finalErrorMsg} Please try again later.`);
      throw new Error(`${finalErrorMsg}`);
    } catch (error) {
      const errorMsg = `Error in uploadMetadata: ${error.message}`;
      console.error(errorMsg, error);
      setStatusMsg('Failed to upload metadata.');
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using local fallback for metadata');
        const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
        const localUrl = URL.createObjectURL(blob);
        return { url: localUrl, source: 'local', success: false, error: error.message };
      }
      
      throw error;
    }
  };

  async function createNFT() {
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Helper function to ensure proper Stellar amount formatting
      const createPaymentAmount = (amount) => {
        const str = parseFloat(amount).toFixed(7);
        return str.replace(/\.?0+$/, '');
      };

      // Validate form inputs
      const { name, description, price, assetCode } = formInput;
      if (!name || !description || !price || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }
      if (!isConnected || !publicKey) {
        throw new Error('Please connect your Stellar wallet');
      }

      // 1. Upload image to IPFS
      setStatusMsg('Uploading image to IPFS...');
      const imageResult = await uploadImage(selectedFile);
      if (!imageResult.success) {
        throw new Error('Failed to upload image to IPFS');
      }
      console.log('Image uploaded as ipfs:', imageResult.url);

      // 2. Prepare and upload metadata
      setStatusMsg('Preparing NFT metadata...');
      const metadata = {
        name,
        description,
        image: imageResult.url,
        price,
        creator: publicKey,
        created_at: new Date().toISOString(),
        attributes: [
          {
            trait_type: 'Asset Code',
            value: assetCode,
          },
        ],
      };
      console.log('Metadata being prepared:', metadata);

      const metadataResult = await uploadMetadata(metadata);
      if (!metadataResult.success) {
        throw new Error('Failed to upload metadata to IPFS');
      }
      console.log('Metadata uploaded as ipfs:', metadataResult.url);

      // 3. Create the NFT using Stellar
      setStatusMsg('Creating NFT on Stellar...');

      const networkConfig = {
        network: process.env.REACT_APP_STELLAR_NETWORK || 'TESTNET',
        passphrase:
          process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
            ? StellarSdk.Networks.TESTNET
            : StellarSdk.Networks.PUBLIC,
      };
      console.log('Using network:', networkConfig.network);

      // Initialize Stellar server
      const server = new StellarSdk.Horizon.Server(process.env.REACT_APP_HORIZON_URL);
      const sourceAccount = await server.loadAccount(publicKey);

      // Validate asset code
      const validateAndNormalizeAssetCode = (rawAssetCode) => {
        const assetCode = rawAssetCode.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
        if (!assetCode) {
          throw new Error('Asset code is required');
        }
        if (assetCode.length < 1 || assetCode.length > 12) {
          throw new Error('Asset code must be between 1 and 12 characters');
        }
        if (!/^[A-Z0-9]+$/.test(assetCode)) {
          throw new Error('Asset code must contain only uppercase letters and numbers');
        }
        if (/XLM/i.test(assetCode)) {
          throw new Error('Asset code cannot contain "XLM"');
        }
        if (assetCode.length <= 4) {
          if (!/^[A-Z][A-Z0-9]{0,3}$/.test(assetCode)) {
            throw new Error('Short asset codes (1-4 characters) must start with a letter');
          }
        } else {
          if (!/^[A-Z][A-Z0-9]{4,11}$/.test(assetCode)) {
            throw new Error('Long asset codes (5-12 characters) must start with a letter');
          }
        }
        console.log('Asset code validated:', {
          original: rawAssetCode,
          normalized: assetCode,
          length: assetCode.length,
          type: assetCode.length <= 4 ? 'ALPHANUM4' : 'ALPHANUM12',
        });
        return assetCode;
      };

      const validatedAssetCode = validateAndNormalizeAssetCode(assetCode);
      const nftAsset = new StellarSdk.Asset(validatedAssetCode, publicKey);

      // Check account balance
      const xlmBalance = sourceAccount.balances.find((b) => b.asset_type === 'native');
      if (!xlmBalance) {
        throw new Error('Unable to determine XLM balance');
      }
      const balance = parseFloat(xlmBalance.balance);
      const requiredBalance = 1.0; // Base reserve + buffer (no trustline needed)
      if (balance < requiredBalance) {
        throw new Error(
          `Insufficient XLM balance. At least ${requiredBalance} XLM required (current: ${balance.toFixed(7)} XLM)`
        );
      }

      // Helper function to submit a transaction
      const submitTransaction = async (operations, description) => {
        try {
          const currentAccount = await server.loadAccount(publicKey);
          console.log(`Account sequence before ${description}:`, currentAccount.sequenceNumber());

          const tx = new StellarSdk.TransactionBuilder(currentAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: networkConfig.passphrase,
          }).setTimeout(180);

          operations.forEach((op, index) => {
            console.log(`Adding operation ${index + 1} to ${description}:`, {
              type: op.type,
              ...(op.type === 'payment'
                ? {
                    asset: op.asset?.getCode(),
                    amount: op.amount,
                    destination: op.destination,
                  }
                : op.type === 'manageData'
                ? {
                    name: op.name,
                    value: op.value ? op.value.toString() : null,
                  }
                : {}),
            });
            tx.addOperation(op);
          });

          const built = tx.build();
          console.log(`${description} details:`, {
            operations: built.operations.map((op) => ({
              type: op.type,
              source: op.source || 'default',
              ...(op.type === 'payment' && op.asset
                ? {
                    asset: op.asset.getCode(),
                    amount: op.amount,
                    destination: op.destination,
                  }
                : op.type === 'manageData'
                ? {
                    name: op.name,
                    value: op.value ? op.value.toString() : null,
                  }
                : {}),
            })),
            sequence: built.sequence,
            sourceAccount: built.source,
            fee: built.fee,
          });

          const xdr = built.toXDR();
          console.log(`${description} XDR:`, xdr);

          const result = await signAndSubmitTransaction(xdr);
          console.log(`${description} successful:`, result);

          await new Promise((resolve) => setTimeout(resolve, 1000));
          const accountAfter = await server.loadAccount(publicKey);
          console.log(`Account sequence after ${description}:`, accountAfter.sequenceNumber());

          return result;
        } catch (error) {
          console.error(`${description} failed:`, error);
          if (error.response?.data?.extras?.result_codes) {
            const codes = error.response.data.extras.result_codes;
            let errorDetail = `${description} failed: ${codes.transaction || 'Unknown error'}`;
            if (codes.operations) {
              const opErrors = codes.operations.map((code, index) =>
                `Operation ${index + 1}: ${code}`
              );
              errorDetail += ` - Operations: [${opErrors.join(', ')}]`;
            }
            throw new Error(errorDetail);
          }
          throw error;
        }
      };

      // Build transaction operations (skip changeTrust for issuer)
      const operations = [];

      // Payment operation to issue the NFT
      console.log('Adding payment operation');
      operations.push(
        StellarSdk.Operation.payment({
          destination: publicKey,
          asset: nftAsset,
          amount: '1.0000000', // Fixed amount for NFT
        })
      );

      // ManageData operation for metadata
      if (metadataResult?.hash) {
        console.log('Adding manageData operation');
        const metadataValue = Buffer.from(metadataResult.hash);
        if (metadataValue.length <= 64) {
          operations.push(
            StellarSdk.Operation.manageData({
              name: `nft_${validatedAssetCode}_metadata`,
              value: metadataValue,
            })
          );
        } else {
          console.warn('Metadata value exceeds 64 bytes, skipping metadata operation');
        }
      }

      // Log operations
      console.log('Operations to be submitted:', operations.map((op, index) => ({
        index,
        type: op.type,
        ...(op.type === 'payment'
          ? {
              asset: op.asset?.getCode(),
              destination: op.destination,
              amount: op.amount,
            }
          : op.type === 'manageData'
          ? {
              name: op.name,
              value: op.value ? op.value.toString() : null,
            }
          : {}),
      })));

      // Submit transaction
      console.log('Submitting NFT creation transaction');
      const result = await submitTransaction(operations, 'NFT creation');
      console.log('Transaction submitted successfully:', result);

      setStatusMsg('NFT created successfully!');

      // Verify creation by checking transaction effects
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const transactionDetails = await server.transactions().transaction(result.hash).call();
      const effects = await server.effects().forTransaction(result.hash).call();

      const paymentEffect = effects.records.find(
        (effect) =>
          effect.type === 'account_credited' &&
          effect.account === publicKey &&
          effect.asset_code === validatedAssetCode &&
          effect.asset_issuer === publicKey
      );

      if (paymentEffect) {
        console.log('NFT issuance verified:', {
          amount: paymentEffect.amount,
          asset: `${paymentEffect.asset_code}:${paymentEffect.asset_issuer}`,
        });
        setStatusMsg('NFT created and verified successfully!');
        toast.success('NFT created successfully!');

        // Reset form and navigate
        setFormInput({
          price: '',
          name: '',
          description: '',
          assetCode: '',
        });
        setSelectedFile(null);
        setPreviewUrl(null);
        navigate('/');
      } else {
        console.error('NFT issuance not found. Transaction details:', transactionDetails);
        console.error('Effects:', effects.records);
        throw new Error('NFT creation succeeded but verification failed. Check transaction effects.');
      }
    } catch (error) {
      console.error('NFT creation error:', error);
      let errorMessage = 'Failed to create NFT: ';
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        errorMessage += `${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          const opErrors = codes.operations.map((code, index) => {
            switch (code) {
              case 'op_malformed':
                return `Operation ${index + 1} is malformed (check asset code format)`;
              case 'op_no_trust':
                return `Operation ${index + 1} requires a trustline`;
              case 'op_underfunded':
                return `Operation ${index + 1} lacks sufficient funds`;
              default:
                return `Operation ${index + 1} failed: ${code}`;
            }
          });
          errorMessage += `\nOperation errors:\n${opErrors.join('\n')}`;
        }
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      setStatusMsg('');
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
                disabled={isLoading || !formInput.name || !formInput.description || !formInput.price || !formInput.assetCode || !selectedFile || !envVarsLoaded}
                className="d-flex align-items-center justify-content-center gap-2"
              >
                {isLoading && <Spinner animation="border" size="sm" />}
                {isLoading ? 'Creating...' : 'Create NFT'}
              </Button>
              
              {!envVarsLoaded && (
                <Alert variant="warning" className="mt-3">
                  <strong>Environment configuration missing</strong>
                  <p>Your application is missing required environment variables. Please check the README for setup instructions.</p>
                </Alert>
              )}
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