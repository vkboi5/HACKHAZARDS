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
    // Check for critical environment variables
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
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Check if Pinata credentials are configured and validate them
  useEffect(() => {
    // Only validate if environment variables are properly loaded
    if (!envVarsLoaded) return;
    
    if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
      console.warn('Pinata API credentials not found in environment variables. IPFS uploads may fail.');
      setErrorMsg('Warning: IPFS configuration missing. Your NFT images may not be stored permanently.');
      return;
    }
    
    // Check if the values look like valid API keys (basic length validation)
    if (pinataConfig.apiKey === 'your-pinata-api-key' || 
        pinataConfig.apiSecret === 'your-pinata-api-secret') {
      setErrorMsg(
        'Warning: You are using placeholder Pinata API keys. Follow these steps to fix:\n' +
        '1. Sign up at https://app.pinata.cloud\n' +
        '2. Go to API Keys → New Key\n' +
        '3. Create a key with "Admin" permissions\n' +
        '4. Copy the values to your .env file\n' +
        '5. Restart your development server'
      );
      return;
    } else if (pinataConfig.apiKey.length < 10 || pinataConfig.apiSecret.length < 20) {
      setErrorMsg('Warning: Your Pinata API keys appear to be invalid. API keys should be longer than 10 characters and API secrets longer than 20 characters.');
      return;
    }
    
    // Test Pinata API credentials when component mounts
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
          setTimeout(() => setStatusMsg(''), 3000); // Clear message after 3 seconds
        } else {
          throw new Error(`Unexpected response: ${response.status}`);
        }
      } catch (error) {
        console.error('Pinata credential validation failed:', error);
        setErrorMsg('Error: Pinata credentials invalid. Please check your API keys in the .env file.');
      }
    };
    
    validatePinataCredentials();
  }, [envVarsLoaded]);
  
  // Display helpful instructions if Pinata credentials are invalid
  useEffect(() => {
    if (errorMsg && errorMsg.includes('Pinata')) {
      console.info('To fix Pinata issues:');
      console.info('1. Create an account at https://app.pinata.cloud');
      console.info('2. Generate API keys at https://app.pinata.cloud/keys');
      console.info('3. Add your keys to the .env file in the project root');
      console.info('4. Restart the development server');
    }
  }, [errorMsg]);

  // Upload image to IPFS via Pinata
  // Upload image to IPFS via Pinata with retry mechanism
  const uploadImage = async (file, maxRetries = 3, retryDelay = 2000) => {
    try {
      setStatusMsg('Preparing image upload...');
      console.log(`Image file details: ${file.name}, type: ${file.type}, size: ${file.size / 1024} KB`);
      
      // Create a local URL as a fallback
      const localUrl = URL.createObjectURL(file);
      
      // Check if Pinata credentials are available
      if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
        setStatusMsg('IPFS configuration missing. Using temporary local storage instead.');
        console.warn('Pinata credentials missing in environment configuration.');
        return { url: localUrl, source: 'local', success: false };
      }
      
      // Check if file is too large
      const maxFileSizeMB = 100; // Pinata's normal limit is ~90-100MB for free tier
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxFileSizeMB) {
        const errorMsg = `File size (${fileSizeMB.toFixed(2)}MB) exceeds the maximum allowed (${maxFileSizeMB}MB).`;
        console.error(errorMsg);
        setStatusMsg(`${errorMsg} Using local storage instead.`);
        return { url: localUrl, source: 'local', success: false };
      }
      
      // Initialize retry counter
      let retryCount = 0;
      let lastError = null;
      
      // Retry loop for uploads
      while (retryCount <= maxRetries) {
        try {
          setStatusMsg(`Uploading image to IPFS via Pinata (${retryCount > 0 ? `retry ${retryCount}/${maxRetries}` : 'first attempt'})...`);
          console.log(`Attempting to upload to Pinata (attempt ${retryCount + 1})...`);
          
          // Prepare the image for upload
          const formData = new FormData();
          formData.append('file', file);
          
          // Add metadata to help organize files
          const metadata = JSON.stringify({
            name: file.name,
            keyvalues: {
              app: 'Galerie',
              timestamp: new Date().toISOString(),
              version: process.env.REACT_APP_VERSION || '1.0.0'
            }
          });
          formData.append('pinataMetadata', metadata);
          
          // Set pinata options
          const pinataOptions = JSON.stringify({
            cidVersion: 1,
            wrapWithDirectory: false
          });
          formData.append('pinataOptions', pinataOptions);
          
          // Log headers being sent (with redacted secrets)
          console.log('Request headers:', {
            'Content-Type': 'multipart/form-data',
            'pinata_api_key': `${pinataConfig.apiKey.substring(0, 3)}...${pinataConfig.apiKey.substring(pinataConfig.apiKey.length - 3)}`,
            'pinata_secret_api_key': '*** REDACTED ***'
          });
          
          // Upload to Pinata with timeout handling
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
          
          // Log success response details (omitting sensitive data)
          console.log('Pinata upload response status:', response.status);
          console.log('Pinata upload response headers:', response.headers);
          
          // Validate response
          if (response.data && response.data.IpfsHash) {
            const ipfsUrl = `${pinataConfig.gateway}${response.data.IpfsHash}`;
            console.log('Successfully uploaded to IPFS:', ipfsUrl);
            console.log('IPFS Hash:', response.data.IpfsHash);
            console.log('Size (bytes):', response.data.PinSize || 'unknown');
            console.log('Timestamp:', response.data.Timestamp || new Date().toISOString());
            
            setStatusMsg('Image uploaded to IPFS successfully!');
            return { url: ipfsUrl, source: 'ipfs', hash: response.data.IpfsHash, success: true };
          } else {
            console.error('Invalid Pinata response:', response.data);
            throw new Error('No IPFS hash returned from Pinata');
          }
        } catch (error) {
          lastError = error;
          let errorMessage = 'Failed to upload to Pinata';
          let shouldRetry = true;
          
          if (error.code === 'ECONNABORTED') {
            errorMessage = 'Pinata upload timed out.';
          } else if (error.response) {
            // Server responded with an error status
            const statusCode = error.response.status;
            const responseBody = error.response.data || {};
            
            errorMessage = `Pinata error (${statusCode}): ${responseBody.message || 'Unknown error'}`;
            console.error('Error response details:', {
              status: statusCode,
              data: responseBody,
              headers: error.response.headers
            });
            
            // Don't retry for client errors (4xx) except for rate limits (429)
            if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
              shouldRetry = false;
            }
            
            // Special handling for specific errors
            if (statusCode === 401) {
              errorMessage = 'Authentication failed. Please check your Pinata API keys.';
              shouldRetry = false;
            } else if (statusCode === 429) {
              errorMessage = 'Rate limit exceeded. Waiting before retry.';
              // Increase delay for rate limit errors
              await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
            }
          } else if (error.request) {
            // Request made but no response received
            errorMessage = 'No response from Pinata servers. Check your internet connection.';
            console.error('Request details:', {
              method: 'POST',
              url: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
              requestSize: file.size,
              requestInitiated: new Date().toISOString()
            });
          }
          
          console.error(`${errorMessage} (Attempt ${retryCount + 1}/${maxRetries + 1})`, error);
          
          // If we shouldn't retry or this was the last attempt, throw the error
          if (!shouldRetry || retryCount >= maxRetries) {
            break;
          }
          
          // Increase retry count and wait before next attempt
          retryCount++;
          setStatusMsg(`${errorMessage} Retrying... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      // If we get here, all retries failed
      const finalErrorMsg = `Failed to upload to IPFS after ${maxRetries + 1} attempts. Using local storage as fallback.`;
      console.error(finalErrorMsg, lastError);
      setStatusMsg(finalErrorMsg);
      return { url: localUrl, source: 'local', success: false, error: lastError?.message };
      
    } catch (error) {
      const errorMsg = `Error in uploadImage: ${error.message}`;
      console.error(errorMsg, error);
      setStatusMsg('Error processing image. Using local storage instead.');
      return { 
        url: URL.createObjectURL(file), 
        source: 'local', 
        success: false, 
        error: error.message 
      };
    }
  };

  // Upload metadata to IPFS via Pinata with retry mechanism
  const uploadMetadata = async (metadata, maxRetries = 3, retryDelay = 2000) => {
    try {
      setStatusMsg('Preparing metadata upload...');
      console.log('Metadata being prepared:', {
        name: metadata.name,
        description: `${metadata.description?.substring(0, 20)}...`,
        hasImage: !!metadata.image
      });
      
      // Create a local URL as a fallback for development
      const createLocalFallback = () => {
        const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
        return URL.createObjectURL(blob);
      };
      
      // Check if Pinata credentials are available
      if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
        setStatusMsg('IPFS configuration missing. Cannot upload metadata to IPFS.');
        console.warn('Pinata credentials missing in environment configuration.');
        
        if (process.env.NODE_ENV === 'development') {
          const localUrl = createLocalFallback();
          console.warn('Using local storage for metadata in development mode');
          return { url: localUrl, source: 'local', success: false };
        }
        
        throw new Error('Pinata API credentials not configured. Please add them to your environment variables.');
      }
      
      // Initialize retry counter
      let retryCount = 0;
      let lastError = null;
      
      // Retry loop for uploads
      while (retryCount <= maxRetries) {
        try {
          setStatusMsg(`Uploading metadata to IPFS via Pinata (${retryCount > 0 ? `retry ${retryCount}/${maxRetries}` : 'first attempt'})...`);
          console.log(`Attempting to upload metadata to Pinata (attempt ${retryCount + 1})...`);
          
          // Add metadata to help organize files on Pinata
          const pinataMetadata = {
            name: `NFT Metadata - ${metadata.name}`,
            keyvalues: {
              app: 'Galerie',
              creator: metadata.creator?.substring(0, 10) || 'unknown',
              timestamp: new Date().toISOString(),
              version: process.env.REACT_APP_VERSION || '1.0.0'
            }
          };
          
          // Set options for pinning
          const pinataOptions = {
            cidVersion: 1
          };
          
          // Prepare the data to be sent
          const data = {
            pinataMetadata,
            pinataOptions,
            pinataContent: metadata
          };
          
          // Log request details (with redacted sensitive info)
          console.log('Metadata request details:', {
            url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            contentSize: JSON.stringify(metadata).length,
            pinataMetadata: pinataMetadata,
            apiKeyPrefix: pinataConfig.apiKey.substring(0, 3)
          });
          
          // Upload to Pinata with timeout handling
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
          
          // Log success response details
          console.log('Pinata metadata upload response status:', response.status);
          console.log('Pinata metadata upload response headers:', response.headers);
          
          // Validate response
          if (response.data && response.data.IpfsHash) {
            const metadataUrl = `${pinataConfig.gateway}${response.data.IpfsHash}`;
            console.log('Successfully uploaded metadata to IPFS:', metadataUrl);
            console.log('Metadata IPFS Hash:', response.data.IpfsHash);
            console.log('Size (bytes):', response.data.PinSize || 'unknown');
            
            setStatusMsg('Metadata uploaded to IPFS successfully!');
            return { url: metadataUrl, source: 'ipfs', hash: response.data.IpfsHash, success: true };
          } else {
            console.error('Invalid Pinata metadata response:', response.data);
            throw new Error('No IPFS hash returned from Pinata for metadata');
          }
        } catch (error) {
          lastError = error;
          let errorMessage = 'Failed to upload metadata to Pinata';
          let shouldRetry = true;
          
          if (error.code === 'ECONNABORTED') {
            errorMessage = 'Metadata upload to Pinata timed out.';
          } else if (error.response) {
            // Server responded with an error status
            const statusCode = error.response.status;
            const responseBody = error.response.data || {};
            
            errorMessage = `Pinata metadata error (${statusCode}): ${responseBody.message || 'Unknown error'}`;
            console.error('Metadata error response details:', {
              status: statusCode,
              data: responseBody,
              headers: error.response.headers
            });
            
            // Don't retry for client errors (4xx) except for rate limits (429)
            if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
              shouldRetry = false;
            }
            
            // Special handling for specific errors
            if (statusCode === 401) {
              errorMessage = 'Authentication failed for metadata. Please check your Pinata API keys.';
              shouldRetry = false;
            } else if (statusCode === 429) {
              errorMessage = 'Rate limit exceeded for metadata. Waiting before retry.';
              // Increase delay for rate limit errors
              await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
            }
          } else if (error.request) {
            // Request made but no response received
            errorMessage = 'No response from Pinata servers for metadata. Check your internet connection.';
            console.error('Metadata request details:', {
              method: 'POST',
              url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
              requestSize: JSON.stringify(metadata).length,
              requestInitiated: new Date().toISOString()
            });
          }
          
          console.error(`${errorMessage} (Attempt ${retryCount + 1}/${maxRetries + 1})`, error);
          
          // If we shouldn't retry or this was the last attempt, go to fallback or throw
          if (!shouldRetry || retryCount >= maxRetries) {
            break;
          }
          
          // Increase retry count and wait before next attempt
          retryCount++;
          setStatusMsg(`${errorMessage} Retrying metadata upload... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      // If we get here, all retries failed
      const finalErrorMsg = `Failed to upload metadata to IPFS after ${maxRetries + 1} attempts.`;
      console.error(finalErrorMsg, lastError);
      
      // In development mode, we can use a local fallback
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using local storage for metadata in development mode');
        const localUrl = createLocalFallback();
        setStatusMsg(`${finalErrorMsg} Using temporary storage for metadata in development mode.`);
        return { url: localUrl, source: 'local', success: false, error: lastError?.message };
      }
      
      // In production, we throw an error
      setStatusMsg(`${finalErrorMsg} Please try again later.`);
      throw new Error(`${finalErrorMsg} Please try again later.`);
      
    } catch (error) {
      const errorMsg = `Error in uploadMetadata: ${error.message}`;
      console.error(errorMsg, error);
      setStatusMsg('Failed to upload metadata. Please try again.');
      
      // Only use fallback in development mode
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using local fallback for metadata in development mode after error');
        const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
        const localUrl = URL.createObjectURL(blob);
        return { url: localUrl, source: 'local', success: false, error: error.message };
      }
      
      throw error;
    }
  };

  // Create NFT
  async function createNFT() {
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');
      
      // Helper function to ensure proper Stellar amount formatting
      const createPaymentAmount = (amount) => {
        // Convert to string and ensure 7 decimal places
        const str = parseFloat(amount).toFixed(7);
        // Remove any trailing zeros after decimal point
        return str.replace(/\.?0+$/, '');
      };

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
        name: formInput.name,
        description: formInput.description,
        image: imageResult.url,
        attributes: [
          {
            trait_type: "Asset Code",
            value: formInput.assetCode
          }
        ]
      };
      console.log('Metadata being prepared:', metadata);

      const metadataResult = await uploadMetadata(metadata);
      if (!metadataResult.success) {
        throw new Error('Failed to upload metadata to IPFS');
      }
      console.log('Metadata uploaded as ipfs:', metadataResult.url);

      // 3. Create the NFT using Stellar
      setStatusMsg('Creating NFT on Stellar...');
      
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }
      console.log('Using connected wallet address for NFT creation:', publicKey);

      const networkConfig = {
        network: process.env.REACT_APP_STELLAR_NETWORK || 'TESTNET',
        passphrase: process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET' 
          ? 'Test SDF Network ; September 2015' 
          : 'Public Global Stellar Network ; September 2015'
      };
      console.log('Using network:', networkConfig.network, 'with passphrase:', networkConfig.passphrase);

      // Build the transaction
      const server = new StellarSdk.Horizon.Server(process.env.REACT_APP_HORIZON_URL);
      const sourceAccount = await server.loadAccount(publicKey);

      // Single asset code validation function
      const validateAndNormalizeAssetCode = (rawAssetCode) => {
        // First, strip any whitespace and non-alphanumeric characters
        const assetCode = rawAssetCode.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
        
        // Basic validation
        if (!assetCode) {
          throw new Error('Asset code is required');
        }
        if (assetCode.length < 1 || assetCode.length > 12) {
          throw new Error('Asset code must be between 1 and 12 characters');
        }
        if (!/^[A-Z0-9]+$/.test(assetCode)) {
          throw new Error('Asset code must contain only uppercase letters and numbers');
        }
        
        // Additional Stellar-specific validations
        if (/XLM/i.test(assetCode)) {
          throw new Error('Asset code cannot contain "XLM"');
        }
        if (assetCode.length <= 4) {
          // For 4-character codes (ALPHANUM4), additional validation
          if (!/^[A-Z][A-Z0-9]{0,3}$/.test(assetCode)) {
            throw new Error('Short asset codes (1-4 characters) must start with a letter');
          }
        } else {
          // For 12-character codes (ALPHANUM12), additional validation
          if (!/^[A-Z][A-Z0-9]{4,11}$/.test(assetCode)) {
            throw new Error('Long asset codes (5-12 characters) must start with a letter');
          }
        }
        
        // Log the validated asset code
        console.log('Asset code validated:', {
          original: rawAssetCode,
          normalized: assetCode,
          length: assetCode.length,
          type: assetCode.length <= 4 ? 'ALPHANUM4' : 'ALPHANUM12'
        });
        
        return assetCode;
      };

      // Validate asset code
      const validatedAssetCode = validateAndNormalizeAssetCode(formInput.assetCode);
      const asset = new StellarSdk.Asset(validatedAssetCode, publicKey);

      // Check if the trustline already exists
      const trustlines = sourceAccount.balances.find(balance => 
        balance.asset_type !== 'native' && 
        balance.asset_code === validatedAssetCode && 
        balance.asset_issuer === publicKey
      );

      // Check account balance
      const xlmBalance = sourceAccount.balances.find(b => b.asset_type === 'native');
      if (!xlmBalance) {
        throw new Error('Unable to determine XLM balance');
      }
      
      const balance = parseFloat(xlmBalance.balance);
      const requiredBalance = 1.5; // Base reserve + trustline + buffer
      
      if (balance < requiredBalance) {
        throw new Error(`Insufficient XLM balance. At least ${requiredBalance} XLM required (current: ${balance.toFixed(7)} XLM)`);
      }
      
      // Helper function to create and submit a transaction
      const submitTransaction = async (operations, description) => {
        try {
          // Get a fresh account for each transaction
          const currentAccount = await server.loadAccount(publicKey);
          
          // Log current account sequence number
          console.log(`Account sequence before ${description}:`, currentAccount.sequenceNumber());
          
          // Build transaction
          // Build transaction with explicit sequence number management
          const tx = new StellarSdk.TransactionBuilder(currentAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: networkConfig.passphrase
          })
          .setTimeout(180);
          
          // Log transaction builder state
          console.log('Transaction builder initialized:', {
            sourceAccount: currentAccount.accountId(),
            sequenceNumber: currentAccount.sequenceNumber(),
            networkPassphrase: networkConfig.passphrase.substring(0, 20) + '...',
            fee: StellarSdk.BASE_FEE
          });
          // Add operations one by one and log details
          operations.forEach((op, index) => {
            console.log(`Adding operation ${index + 1} to ${description}:`, {
              type: op.type,
              ...(op.type === 'payment' ? {
                asset: op.asset.getCode(),
                amount: op.amount,
                destination: op.destination
              } : {})
            });
            tx.addOperation(op);
          });
          
          const built = tx.build();
          
          // Log complete transaction details before submission
          console.log(`${description} details:`, {
            operations: built.operations.map(op => ({
              type: op.type,
              source: op.source || 'default',
              ...(op.type === 'payment' ? {
                asset: op.asset.getCode(),
                amount: op.amount,
                destination: op.destination
              } : {})
            })),
            sequence: built.sequence,
            sourceAccount: built.source,
            fee: built.fee
          });
          
          const xdr = built.toXDR();
          console.log(`${description} XDR:`, xdr);
          
          // Submit and wait for confirmation
          const result = await signAndSubmitTransaction(xdr);
          console.log(`${description} successful:`, result);
          
          // Wait for network to process
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verify account state after transaction
          const accountAfter = await server.loadAccount(publicKey);
          console.log(`Account sequence after ${description}:`, accountAfter.sequenceNumber());
          
          return result;
        } catch (error) {
          console.error(`${description} failed:`, error);
          
          // Enhanced error reporting
          if (error.response?.data?.extras?.result_codes) {
            const codes = error.response.data.extras.result_codes;
            let errorDetail = `${description} failed: ${codes.transaction || 'Unknown error'}`;
            
            if (codes.operations) {
              const opErrors = codes.operations.map((code, index) => 
                `Operation ${index + 1}: ${code}`
              );
              errorDetail += `\nOperation errors:\n${opErrors.join('\n')}`;
            }
            
            throw new Error(errorDetail);
          }
          
          throw error;
        }
      };

      // Create single transaction with all operations
      // Create single transaction with all operations
      const operations = [];
      
      // Create and validate asset instance once
      const nftAsset = new StellarSdk.Asset(
        validatedAssetCode,
        publicKey
      );
      
      // Log asset details for verification
      console.log('NFT asset details:', {
        code: nftAsset.getCode(),
        issuer: nftAsset.getIssuer(),
        type: nftAsset.getAssetType(),
        length: nftAsset.getCode().length
      });

      // Verify asset code format
      if (nftAsset.getCode().length <= 4) {
        console.log('Using ALPHANUM4 asset type');
      } else {
        console.log('Using ALPHANUM12 asset type');
      }
      
      // 1. Add trustline operation if needed
      if (!trustlines) {
        console.log('Adding changeTrust operation');
        operations.push(
          StellarSdk.Operation.changeTrust({
            asset: nftAsset,
            limit: "1"
          })
        );
      }
      
      // 2. Payment operation for NFT issuance
      console.log('Adding payment operation');
      operations.push(
        StellarSdk.Operation.payment({
          destination: publicKey,
          asset: nftAsset,
          amount: "1.0000000"  // Fixed amount for NFT
        })
      );
      // 3. Add metadata if available
      if (metadataResult?.hash) {
        console.log('Adding manageData operation');
        const metadataValue = Buffer.from(metadataResult.hash);
        if (metadataValue.length <= 64) {
          operations.push(
            StellarSdk.Operation.manageData({
              name: `nft_${validatedAssetCode}_metadata`,
              value: metadataValue
            })
          );
        } else {
          console.warn('Metadata value exceeds 64 bytes, skipping metadata operation');
        }
      }

      // Log the complete operation list
      console.log('Operations to be submitted:', operations.map((op, index) => ({
        index,
        type: op.type,
        ...(op.type === 'payment' ? {
          asset: op.asset.getCode(),
          destination: op.destination,
          amount: op.amount
        } : op.type === 'changeTrust' ? {
          asset: op.asset.getCode(),
          limit: op.limit
        } : {})
      })));

      // Submit all operations in a single transaction
      console.log('Submitting NFT creation transaction');
      const result = await submitTransaction(operations, "NFT creation");
      console.log('Transaction submitted successfully:', result);
      
      setStatusMsg('NFT created successfully!');
      
      // Wait briefly before verifying to allow for network propagation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify creation
      const updatedAccount = await server.loadAccount(publicKey);
      const nftBalance = updatedAccount.balances.find(b => 
        b.asset_type !== 'native' && 
        b.asset_code === validatedAssetCode && 
        b.asset_issuer === publicKey
      );
      
      if (nftBalance) {
        console.log('NFT balance verified:', nftBalance.balance);
        setStatusMsg('NFT created and verified successfully!');
        toast.success('NFT created successfully!');
        
        // Reset form and navigate
        setFormInput({
          price: '',
          name: '',
          description: '',
          assetCode: ''
        });
        setSelectedFile(null);
        setPreviewUrl(null);
        navigate('/');
      } else {
        throw new Error('NFT creation succeeded but verification failed');
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