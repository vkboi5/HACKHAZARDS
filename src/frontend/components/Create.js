import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import * as StellarSdk from '@stellar/stellar-sdk';
import { useStellarWallet } from './StellarWalletProvider';
import * as freighterApi from '@stellar/freighter-api';
import axios from 'axios';
import './Create.css';
import { toast } from 'react-hot-toast';

const Create = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, signTransaction } = useStellarWallet();
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
  
  // Initialize Stellar server
  const server = new StellarSdk.Horizon.Server(
    process.env.REACT_APP_HORIZON_URL || 
    (process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET' 
      ? 'https://horizon-testnet.stellar.org' 
      : 'https://horizon.stellar.org')
  );

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

  const createNFT = async () => {
    try {
      // Input validation
      if (!formInput.name || !formInput.description || !formInput.price || !formInput.assetCode || !selectedFile) {
        toast("Please fill all fields and upload an image");
        return;
      }

      // Parse price as a number and validate
      const priceValue = parseFloat(formInput.price);
      if (isNaN(priceValue) || priceValue <= 0) {
        toast("Price must be a positive number");
        return;
      }

      // Check if wallet is connected
      if (!publicKey) {
        toast("Please connect your Stellar wallet first");
        return;
      }

      setIsLoading(true);
      setStatusMsg('Starting NFT creation process...');

      // 1. Upload image to IPFS
      toast("Uploading image to IPFS...");
      const imageResult = await uploadImage(selectedFile);
      if (!imageResult.url) {
        setIsLoading(false);
        return;
      }
      
      // 2. Create and upload metadata
      toast("Creating and uploading metadata...");
      const metadataResult = await uploadMetadata({
        name: formInput.name,
        description: formInput.description,
        image: imageResult.url,
        price: formInput.price,
        creator: publicKey,
        created_at: new Date().toISOString(),
        storage_type: imageResult.source // Track if we're using IPFS or local
      });
      if (!metadataResult.url) {
        setIsLoading(false);
        return;
      }
      
      // 3. Create NFT on Stellar
      toast("Creating NFT on Stellar network...");
      
      try {
        // Load account details for the issuer (connected wallet)
        console.log("Loading account details...");
        const account = await server.loadAccount(publicKey);
        
        // Check if account has minimum required XLM for operations
        console.log("Checking account balance...");
        if (parseFloat(account.balances.find(b => b.asset_type === 'native')?.balance) < 5) {
          toast.error("Your account needs at least 5 XLM to create an NFT");
          setIsLoading(false);
          return;
        }
        
        // Build the transaction
        console.log("Building transaction...");
        
        // Get the recommended base fee from the network
        const fee = await server.fetchBaseFee();
        console.log("Network recommended fee:", fee, "stroops per operation");
        
        // Add a small buffer to the fee to ensure it's accepted
        const adjustedFee = Math.max(fee * 2, 100);
        console.log("Using fee:", adjustedFee, "stroops per operation");
        
        // Calculate current time and add time bounds
        const now = Math.floor(Date.now() / 1000);
        const timeBounds = {
          minTime: 0,              // Valid immediately
          maxTime: now + 5 * 60    // Valid for next 5 minutes
        };
        console.log("Setting transaction time bounds:", timeBounds);
        
        // Stellar has specific rules for asset codes:
        // - Alphanumeric characters only (A-Z, a-z, 0-9)
        // - Length between 1-12 characters
        const validAssetCode = formInput.assetCode.trim();
        if (!/^[a-zA-Z0-9]{1,12}$/.test(validAssetCode)) {
          toast.error("Asset code must be 1-12 alphanumeric characters (A-Z, a-z, 0-9)");
          setIsLoading(false);
          return;
        }
        
        console.log(`Creating NFT with asset code: ${validAssetCode}`);
        
        // Create Asset object using the validated code
        try {
          const asset = new StellarSdk.Asset(validAssetCode, publicKey);
          console.log("Asset created:", asset.code, asset.issuer);
          
          // Extract just the IPFS hash from the URL to stay under 64 bytes
          let ipfsHash;
          if (metadataResult.hash) {
            // If we have the hash directly, use it
            ipfsHash = metadataResult.hash;
          } else if (metadataResult.url && metadataResult.url.includes('/ipfs/')) {
            // Extract hash from URL like https://gateway.pinata.cloud/ipfs/bafkreihywofkypdhr2f5x7uhweorz35ogohrqmesmtm3j4zf5ehzumo3ta
            ipfsHash = metadataResult.url.split('/ipfs/')[1];
          } else {
            // Fallback to just the URL, but this might still be too long
            ipfsHash = metadataResult.url;
          }
          
          // Ensure the ipfsHash is a valid string and not too long
          if (typeof ipfsHash !== 'string') {
            ipfsHash = String(ipfsHash);
          }
          
          // Check if the hash is too long (Stellar manageData value has a 64-byte limit)
          const encoder = new TextEncoder();
          const ipfsHashBytes = encoder.encode(ipfsHash);
          
          if (ipfsHashBytes.length > 64) {
            console.warn(`IPFS hash is too long (${ipfsHashBytes.length} bytes), truncating to 64 bytes`);
            // Truncate if needed - not ideal but better than failing
            ipfsHash = ipfsHash.substring(0, 55) + '...';
          }
          
          console.log("Using IPFS hash:", ipfsHash, `(${encoder.encode(ipfsHash).length} bytes)`);
          
          // Build transaction with minimal operations to reduce potential issues
          const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: adjustedFee, 
            networkPassphrase: process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
              ? StellarSdk.Networks.TESTNET
              : StellarSdk.Networks.PUBLIC
          })
            // Add metadata hash to identify the NFT
            .addOperation(StellarSdk.Operation.manageData({
              name: 'ipfs',
              value: ipfsHash
            }))
            // Create trustline first
            .addOperation(StellarSdk.Operation.changeTrust({
              asset: asset,
              limit: "1000000000" // Simpler format without decimal part
            }))
            // Issue the asset
            .addOperation(StellarSdk.Operation.payment({
              destination: publicKey,
              asset: asset,
              amount: "1" // Simpler format without decimal part
            }))
            .setTimeout(180) // 3 minute timeout
            .build();
          
          console.log("Transaction built successfully, requesting signature...");
          
          // Sign the transaction using the wallet
          const signedXDR = await signTransaction(transaction);
          console.log("Transaction signed successfully, submitting to network...");
          
          // Convert signed XDR back to transaction
          const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
            signedXDR,
            process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
              ? StellarSdk.Networks.TESTNET
              : StellarSdk.Networks.PUBLIC
          );
          
          // Log transaction details for debugging
          console.log("Signed transaction details:");
          console.log("- Transaction fee:", signedTransaction.fee);
          console.log("- Operations count:", signedTransaction.operations.length);
          console.log("- Source account:", signedTransaction.source);
          
          if (signedTransaction.timeBounds) {
            const now = Math.floor(Date.now() / 1000);
            console.log("- Time bounds:", {
              minTime: signedTransaction.timeBounds.minTime,
              maxTime: signedTransaction.timeBounds.maxTime,
              currentTime: now,
              expiresIn: signedTransaction.timeBounds.maxTime - now
            });
          }
          
          // Log operation details
          signedTransaction.operations.forEach((op, index) => {
            console.log(`- Operation ${index + 1}:`, op.type);
          });
          
          // Submit the transaction
          try {
            const txResult = await server.submitTransaction(signedTransaction);
            console.log("Transaction submitted successfully:", txResult);
            
            // Success! Clear form and navigate back to home
            toast.success("NFT created successfully!");
            setFormInput({
              price: '',
              name: '',
              description: '',
              assetCode: '',
            });
            setSelectedFile(null);
            setPreviewUrl(null);
            setFileUrl(null);
            
            // Navigate to home page after short delay
            setTimeout(() => navigate('/'), 2000);
          } catch (submitError) {
            console.error("Error submitting transaction to Stellar network:", submitError);
            
            // Extract and display detailed error information
            let errorMessage = "Failed to submit transaction";
            
            if (submitError.response && submitError.response.data) {
              const responseData = submitError.response.data;
              console.error("Horizon error details:", responseData);
              
              // Check for operation result codes
              if (responseData.extras && responseData.extras.result_codes) {
                const resultCodes = responseData.extras.result_codes;
                console.error("Transaction result codes:", resultCodes);
                
                // Log the detailed operation codes
                if (resultCodes.operations && resultCodes.operations.length > 0) {
                  console.error("Operation result codes:", resultCodes.operations);
                  resultCodes.operations.forEach((code, index) => {
                    const opType = signedTransaction.operations[index]?.type || 'unknown';
                    console.error(`Operation ${index + 1} (${opType}) failed with code: ${code}`);
                    
                    // Add helpful explanations for common operation errors
                    if (code === 'op_no_trust') {
                      console.error("  → This means a trustline doesn't exist - make sure you create a trustline first before sending an asset");
                    } else if (code === 'op_line_full') {
                      console.error("  → The trustline is full, increase the limit"); 
                    } else if (code === 'op_underfunded') {
                      console.error("  → Not enough funds for this operation");
                    } else if (code === 'op_no_issuer') {
                      console.error("  → The asset issuer doesn't exist or is invalid");
                    } else if (code === 'op_no_account') {
                      console.error("  → The destination account doesn't exist");
                    } else if (code === 'op_invalid_limit') { 
                      console.error("  → The limit for a trustline is invalid");
                    } else if (code === 'op_data_name_not_found') {
                      console.error("  → The manageData operation tried to remove a data entry that doesn't exist");
                    } else if (code === 'op_too_many_signers') {
                      console.error("  → Maximum number of signers already reached");
                    } else if (code === 'op_data_invalid_name') {
                      console.error("  → The manageData name is invalid (must be <= 64 bytes)");
                    } else if (code === 'op_data_value_too_long') {
                      console.error("  → The manageData value is too long (must be <= 64 bytes)");
                    }
                  });
                  
                  // Include operation codes in the error message
                  errorMessage += `, Operations failed: ${resultCodes.operations.join(', ')}`;
                }
                
                // Add specific error message based on common error codes
                if (resultCodes.transaction) {
                  errorMessage += `: ${resultCodes.transaction}`;
                  
                  if (resultCodes.transaction === 'tx_bad_seq') {
                    errorMessage += " (sequence number is incorrect, try refreshing the page)";
                  } else if (resultCodes.transaction === 'tx_insufficient_fee') {
                    errorMessage += " (transaction fee is too low)";
                  } else if (resultCodes.transaction === 'tx_bad_auth') {
                    errorMessage += " (transaction not properly signed)";
                  }
                }
              } else if (responseData.title) {
                errorMessage += `: ${responseData.title}`;
                if (responseData.detail) {
                  errorMessage += ` - ${responseData.detail}`;
                }
              }
            }
            
            toast.error(errorMessage);
            throw submitError; // Re-throw to outer catch
          }
        } catch (assetError) {
          console.error("Error creating Stellar asset:", assetError);
          toast.error(`Failed to create Stellar asset: ${assetError.message}`);
        }
      } catch (error) {
        console.error("Error in createNFT function:", error);
        toast.error(`Error: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error in createNFT function:", error);
      toast.error(`Error: ${error.message}`);
    }
  };

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
}

export default Create;