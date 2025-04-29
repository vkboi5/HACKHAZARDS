import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Alert, Spinner, Tabs, Tab, InputGroup } from 'react-bootstrap';
import * as StellarSdk from '@stellar/stellar-sdk';
import { useWalletConnect } from './WalletConnectProvider';
import { useWallet } from '../../contexts/WalletContext';
import { useWeb3Auth } from './Web3AuthProvider';
import axios from 'axios';
import './Create.css';
import { toast } from 'react-hot-toast';
import BidService from './BidService';
import AuctionService from './AuctionService';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const Create = () => {
  const navigate = useNavigate();
  const { publicKey: walletConnectPublicKey, isConnected: isWalletConnected, signAndSubmitTransaction } = useWalletConnect();
  const wallet = useWallet();
  const { publicKey: web3AuthPublicKey, isConnected: isWeb3AuthConnected } = useWeb3Auth();
  
  // Combined wallet state - user is authenticated if any method is connected
  const isAuthenticated = isWalletConnected || wallet.isLoggedIn || isWeb3AuthConnected;
  const publicKey = walletConnectPublicKey || wallet.publicKey || web3AuthPublicKey;

  const [formInput, setFormInput] = useState({
    price: '',
    name: '',
    description: '',
    assetCode: '',
    minimumBid: '',
    auctionEndDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // Default to 24 hours from now
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [pinataConfig, setPinataConfig] = useState({
    apiKey: import.meta.env.VITE_PINATA_API_KEY,
    apiSecret: import.meta.env.VITE_PINATA_API_SECRET,
    gateway: import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/',
    timeout: 60000,
  });
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('fixed-price');

  // Validate and normalize asset code
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

  // Debug authentication state
  useEffect(() => {
    console.log('Authentication state:', {
      isWalletConnected,
      walletIsLoggedIn: wallet.isLoggedIn,
      isWeb3AuthConnected,
      publicKey,
      isAuthenticated
    });
  }, [isWalletConnected, wallet.isLoggedIn, isWeb3AuthConnected, publicKey, isAuthenticated]);

  // Validate price
  const validatePrice = (price) => {
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      throw new Error(`Invalid price: ${price || 'undefined'} (must be a positive number)`);
    }
    let formattedPrice = parseFloat(price).toFixed(7).replace(/\.?0+$/, '');
    if (!/^\d+(\.\d{1,7})?$/.test(formattedPrice)) {
      throw new Error(`Price has too many decimal places: ${formattedPrice} (max 7)`);
    }
    console.log('Validated price:', { input: price, output: formattedPrice });
    return formattedPrice;
  };

  // Verify environment variables on component mount
  useEffect(() => {
    const missingVars = [];
    if (!import.meta.env.VITE_PINATA_API_KEY) missingVars.push('REACT_APP_PINATA_API_KEY');
    if (!import.meta.env.VITE_PINATA_API_SECRET) missingVars.push('REACT_APP_PINATA_API_SECRET');
    if (!import.meta.env.VITE_IPFS_GATEWAY) missingVars.push('REACT_APP_IPFS_GATEWAY');
    if (!import.meta.env.VITE_STELLAR_NETWORK) missingVars.push('REACT_APP_STELLAR_NETWORK');
    if (!import.meta.env.VITE_HORIZON_URL) missingVars.push('REACT_APP_HORIZON_URL');
    if (!import.meta.env.VITE_ESCROW_ACCOUNT) missingVars.push('REACT_APP_ESCROW_ACCOUNT');

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
            'pinata_secret_api_key': pinataConfig.apiSecret,
          },
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

          const pinataOptions = JSON.stringify({
            cidVersion: 1,
            wrapWithDirectory: false,
          });
          formData.append('pinataOptions', pinataOptions);

          const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
                'pinata_api_key': pinataConfig.apiKey,
                'pinata_secret_api_key': pinataConfig.apiSecret,
              },
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              timeout: pinataConfig.timeout,
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
        error: error.message,
      };
    }
  };

  const uploadMetadata = async (metadata, maxRetries = 3, retryDelay = 2000) => {
    try {
      setStatusMsg('Preparing metadata upload...');
      console.log('Metadata prepared:', {
        name: metadata.name,
        description: `${metadata.description?.substring(0, 20)}...`,
        hasImage: !!metadata.image,
        assetCode: metadata.assetCode,
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
              version: import.meta.env.VITE_VERSION || '1.0.0',
              assetCode: metadata.assetCode,
            },
          };

          const pinataOptions = {
            cidVersion: 1,
          };

          const data = {
            pinataMetadata,
            pinataOptions,
            pinataContent: metadata,
          };

          const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            data,
            {
              headers: {
                'Content-Type': 'application/json',
                'pinata_api_key': pinataConfig.apiKey,
                'pinata_secret_api_key': pinataConfig.apiSecret,
              },
              timeout: pinataConfig.timeout,
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
    if (!isAuthenticated) {
      toast.error("Please login first!");
      return;
    }
    
    if (!publicKey) {
      toast.error("No wallet address found! Please reconnect your wallet.");
      return;
    }
    
    try {
      if (!formInput.name || !formInput.description || !formInput.price || !formInput.assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }

      const validatedAssetCode = validateAndNormalizeAssetCode(formInput.assetCode);
      const validatedPrice = validatePrice(formInput.price);

      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate form inputs
      const { name, description, price, assetCode } = formInput;
      if (!name || !description || !price || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }

      // Upload image to IPFS
      setStatusMsg('Uploading image to IPFS...');
      const imageResult = await uploadImage(selectedFile);
      if (!imageResult.success) {
        throw new Error('Failed to upload image to IPFS');
      }
      console.log('Image uploaded as ipfs:', imageResult.url);

      // Prepare and upload metadata
      setStatusMsg('Preparing NFT metadata...');
      const metadata = {
        name,
        description,
        image: imageResult.url,
        price: validatedPrice,
        creator: publicKey,
        assetCode: validatedAssetCode,
        created_at: new Date().toISOString(),
        attributes: [
          {
            trait_type: 'Asset Code',
            value: validatedAssetCode,
          },
        ],
      };
      console.log('Metadata being prepared:', metadata);

      const metadataResult = await uploadMetadata(metadata);
      if (!metadataResult.success) {
        throw new Error('Failed to upload metadata to IPFS');
      }
      console.log('Metadata uploaded as ipfs:', metadataResult.url);

      // Create the NFT using Stellar
      setStatusMsg('Creating NFT on Stellar...');

      const networkConfig = {
        network: import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET',
        passphrase:
          import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'
            ? StellarSdk.Networks.TESTNET
            : StellarSdk.Networks.PUBLIC,
      };
      console.log('Using network:', networkConfig.network);

      // Initialize Stellar server
      const server = new StellarSdk.Horizon.Server(import.meta.env.VITE_HORIZON_URL);
      const sourceAccount = await server.loadAccount(publicKey);

      // Check account balance
      const xlmBalance = sourceAccount.balances.find((b) => b.asset_type === 'native');
      if (!xlmBalance) {
        throw new Error('Unable to determine XLM balance');
      }
      const balance = parseFloat(xlmBalance.balance);
      const requiredBalance = 1.5; // Base reserve + buffer for offer
      if (balance < requiredBalance) {
        throw new Error(
          `Insufficient XLM balance. At least ${requiredBalance} XLM required (current: ${balance.toFixed(7)} XLM)`
        );
      }

      // Create the NFT asset
      const nftAsset = new StellarSdk.Asset(validatedAssetCode, publicKey);

      // Helper function to submit a transaction
      const submitTransaction = async (operations, description) => {
        try {
          const stellarServer = new StellarSdk.Horizon.Server(
            import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
          );
          
          // Load account to get the latest sequence number
          const account = await stellarServer.loadAccount(publicKey);
          console.log('Account sequence before NFT creation:', account.sequence);
          
          // Build transaction
          const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: 
              import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                ? StellarSdk.Networks.TESTNET 
                : StellarSdk.Networks.PUBLIC
          });
          
          // Add each operation to the transaction
          operations.forEach((operation, index) => {
            console.log(`Adding operation ${index + 1} to NFT creation: ${JSON.stringify(operation)}`);
            transaction.addOperation(operation);
          });
          
          // Finalize transaction
          const builtTransaction = transaction.setTimeout(180).build();
          const txDetails = {
            operations: operations,
            sequence: builtTransaction.sequence,
            source: builtTransaction.source,
            fee: builtTransaction.fee
          };
          console.log('NFT creation details:', txDetails);
          
          // Convert transaction to XDR format
          const xdr = builtTransaction.toXDR();
          console.log('NFT creation XDR:', xdr);
          
          // First try WalletConnect's signAndSubmitTransaction
          let result;
          
          try {
            // Attempt to use WalletConnect if connected
            if (isWalletConnected) {
              console.log('Using WalletConnect provider to sign transaction');
              result = await signAndSubmitTransaction(xdr);
            }
            // Use Web3Auth or fall back to window method if available
            else if (wallet.isLoggedIn || isWeb3AuthConnected) {
              console.log('Using Web3Auth to sign transaction');
              // Try to sign directly with the private key
              try {
                // Do not use useWallet() hook here - access getPrivateKey from component context
                if (typeof wallet.getPrivateKey === 'function') {
                  // Get the private key
                  const privateKey = await wallet.getPrivateKey();
                  if (!privateKey) {
                    throw new Error('No private key available');
                  }
                  
                  // Create a stellar keypair
                  console.log('Creating Stellar keypair from private key');
                  let keypair;
                  
                  try {
                    // Try direct key usage
                    keypair = StellarSdk.Keypair.fromSecret(privateKey);
                  } catch (keyError) {
                    console.log('Direct keypair creation failed, using deterministic approach');
                    // Use deterministic approach for Web3Auth keys
                    const encoder = new TextEncoder();
                    const data = encoder.encode(privateKey);
                    const hash = await crypto.subtle.digest('SHA-256', data);
                    const seed = new Uint8Array(hash).slice(0, 32);
                    keypair = StellarSdk.Keypair.fromRawEd25519Seed(seed);
                  }
                  
                  // Parse the XDR
                  console.log('Parsing transaction XDR');
                  const networkPassphrase = import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                    ? StellarSdk.Networks.TESTNET 
                    : StellarSdk.Networks.PUBLIC;
                  
                  const transaction = StellarSdk.TransactionBuilder.fromXDR(
                    xdr,
                    networkPassphrase
                  );
                  
                  // Sign the transaction
                  console.log('Signing transaction with keypair');
                  transaction.sign(keypair);
                  
                  // Submit the transaction
                  console.log('Submitting transaction to Stellar');
                  const stellarServer = new StellarSdk.Horizon.Server(
                    import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
                  );
                  
                  result = await stellarServer.submitTransaction(transaction);
                  console.log('Transaction submitted successfully:', result);
                } else {
                  throw new Error('getPrivateKey function not available');
                }
              } catch (directSignError) {
                console.error('Error with direct signing approach:', directSignError);
                
                // Fall back to using the exported function from WalletContext
                try {
                  const { signAndSubmitTransactionFromWalletContext } = await import('../../contexts/WalletContext');
                  if (typeof signAndSubmitTransactionFromWalletContext === 'function') {
                    console.log('Using signAndSubmitTransactionFromWalletContext from WalletContext');
                    result = await signAndSubmitTransactionFromWalletContext(xdr, wallet);
                  } else {
                    throw new Error('Function not available');
                  }
                } catch (importError) {
                  console.error('Error importing from WalletContext:', importError);
                  // Fall back to window method
                  if (window.signAndSubmitTransaction) {
                    console.log('Using window.signAndSubmitTransaction method');
                    result = await window.signAndSubmitTransaction(xdr);
                  } else {
                    throw new Error('No transaction signing method available for Web3Auth');
                  }
                }
              }
            }
            else {
              console.error('Wallet connection check failed:', {
                isWalletConnected,
                walletIsLoggedIn: wallet.isLoggedIn,
                isWeb3AuthConnected,
                publicKey,
                isAuthenticated
              });
              
              // If we have a publicKey but no standard wallet connection method,
              // try to use another approach
              if (publicKey && isAuthenticated) {
                console.log('Using fallback transaction signing method with public key');
                // Create a transaction without signing it
                const networkPassphrase = import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                  ? StellarSdk.Networks.TESTNET 
                  : StellarSdk.Networks.PUBLIC;
                
                const transaction = StellarSdk.TransactionBuilder.fromXDR(
                  xdr,
                  networkPassphrase
                );
                
                // Try alternative signing methods
                if (window.signAndSubmitTransaction) {
                  console.log('Using window.signAndSubmitTransaction as fallback');
                  result = await window.signAndSubmitTransaction(xdr);
                } else if (typeof window.freighter !== 'undefined' && publicKey) {
                  console.log('Attempting to use Freighter as fallback');
                  try {
                    const signedXDR = await window.freighter.signTransaction(xdr, networkPassphrase);
                    const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
                      signedXDR,
                      networkPassphrase
                    );
                    
                    const stellarServer = new StellarSdk.Horizon.Server(
                      import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
                    );
                    
                    result = await stellarServer.submitTransaction(signedTransaction);
                    console.log('Transaction submitted successfully with Freighter:', result);
                  } catch (freighterError) {
                    console.error('Freighter fallback failed:', freighterError);
                    throw freighterError;
                  }
                } else {
                  throw new Error('No transaction signing method available');
                }
              } else {
                throw new Error('Wallet not connected');
              }
            }
          } catch (error) {
            console.error('Transaction signing and submission error:', error);
            throw error;
          }
          
          console.log('Transaction submitted successfully:', result);
          
          // Return transaction hash
          return result?.hash || result;
        } catch (error) {
          console.error('NFT creation failed:', error);
          throw error;
        }
      };

      // Build transaction operations
      const operations = [];

      // Payment operation to issue the NFT
      console.log('Adding payment operation');
      operations.push(
        StellarSdk.Operation.payment({
          destination: publicKey,
          asset: nftAsset,
          amount: '1.0000000'
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

      // ManageSellOffer to list NFT for sale
      console.log('Adding manageSellOffer operation');
      try {
        operations.push(
          StellarSdk.Operation.manageSellOffer({
            selling: nftAsset,
            buying: StellarSdk.Asset.native(),
            amount: '1',
            price: validatedPrice,
          })
        );
      } catch (opError) {
        console.error('manageSellOffer operation error:', opError);
        throw new Error(`Failed to create manageSellOffer: ${opError.message}`);
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
          : op.type === 'manageSellOffer'
          ? {
              selling: op.selling.getCode(),
              buying: op.buying.getCode(),
              amount: op.amount,
              price: op.price,
            }
          : {}),
      })));

      // Submit transaction
      console.log('Submitting NFT creation transaction');
      try {
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
            minimumBid: '',
            auctionEndDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // Default to 24 hours from now
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
        // Just re-throw the error to be handled by the outer catch
        throw error;
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

  // Create NFT with Open for Bids
  async function createOpenBidNFT() {
    if (!isAuthenticated) {
      toast.error("Please login first!");
      return;
    }
    
    if (!publicKey) {
      toast.error("No wallet address found! Please reconnect your wallet.");
      return;
    }
    
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate form inputs
      const { name, description, minimumBid, assetCode } = formInput;
      if (!name || !description || !minimumBid || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }

      // Validate and normalize asset code
      const validatedAssetCode = validateAndNormalizeAssetCode(assetCode);

      // Validate and format minimum bid price
      const validatedMinimumBid = validatePrice(minimumBid);

      // Upload image to IPFS
      setStatusMsg('Uploading image to IPFS...');
      const imageResult = await uploadImage(selectedFile);
      if (!imageResult.success) {
        throw new Error('Failed to upload image to IPFS');
      }
      console.log('Image uploaded as ipfs:', imageResult.url);

      // Prepare and upload metadata
      setStatusMsg('Preparing NFT metadata...');
      const metadata = {
        name,
        description,
        image: imageResult.url,
        minimumBid: validatedMinimumBid,
        creator: publicKey,
        assetCode: validatedAssetCode,
        type: 'open_bid',
        created_at: new Date().toISOString(),
        attributes: [
          {
            trait_type: 'Asset Code',
            value: validatedAssetCode,
          },
          {
            trait_type: 'Listing Type',
            value: 'Open for Bids',
          },
        ],
      };
      console.log('Metadata being prepared:', metadata);

      const metadataResult = await uploadMetadata(metadata);
      if (!metadataResult.success) {
        throw new Error('Failed to upload metadata to IPFS');
      }
      console.log('Metadata uploaded as ipfs:', metadataResult.url);

      // Create the NFT using Stellar
      setStatusMsg('Creating NFT on Stellar...');

      const networkConfig = {
        network: import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET',
        passphrase:
          import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'
            ? StellarSdk.Networks.TESTNET
            : StellarSdk.Networks.PUBLIC,
      };
      console.log('Using network:', networkConfig.network);

      // Initialize Stellar server
      const server = new StellarSdk.Horizon.Server(import.meta.env.VITE_HORIZON_URL);
      const sourceAccount = await server.loadAccount(publicKey);

      // Check account balance
      const xlmBalance = sourceAccount.balances.find((b) => b.asset_type === 'native');
      if (!xlmBalance) {
        throw new Error('Unable to determine XLM balance');
      }
      const balance = parseFloat(xlmBalance.balance);
      const requiredBalance = 1.5; // Base reserve + buffer for operations
      if (balance < requiredBalance) {
        throw new Error(
          `Insufficient XLM balance. At least ${requiredBalance} XLM required (current: ${balance.toFixed(7)} XLM)`
        );
      }

      // Create the NFT asset
      const nftAsset = new StellarSdk.Asset(validatedAssetCode, publicKey);

      // Build transaction operations
      const operations = [];

      // Payment operation to issue the NFT
      console.log('Adding payment operation');
      operations.push(
        StellarSdk.Operation.payment({
          destination: publicKey,
          asset: nftAsset,
          amount: '1.0000000'
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

      // Add flag to indicate this is an 'open for bids' NFT
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${validatedAssetCode}_type`,
          value: Buffer.from('open_bid'),
        })
      );

      // Add minimum bid as data entry
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${validatedAssetCode}_min_bid`,
          value: Buffer.from(validatedMinimumBid),
        })
      );

      // Define submitTransaction function within the scope
      const submitTransaction = async (operations, description) => {
        try {
          const stellarServer = new StellarSdk.Horizon.Server(
            import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
          );
          
          // Load account to get the latest sequence number
          const account = await stellarServer.loadAccount(publicKey);
          console.log('Account sequence before NFT creation:', account.sequence);
          
          // Build transaction
          const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: 
              import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                ? StellarSdk.Networks.TESTNET 
                : StellarSdk.Networks.PUBLIC
          });
          
          // Add each operation to the transaction
          operations.forEach((operation, index) => {
            console.log(`Adding operation ${index + 1} to NFT creation: ${JSON.stringify(operation)}`);
            transaction.addOperation(operation);
          });
          
          // Finalize transaction
          const builtTransaction = transaction.setTimeout(180).build();
          const txDetails = {
            operations: operations,
            sequence: builtTransaction.sequence,
            source: builtTransaction.source,
            fee: builtTransaction.fee
          };
          console.log('NFT creation details:', txDetails);
          
          // Convert transaction to XDR format
          const xdr = builtTransaction.toXDR();
          console.log('NFT creation XDR:', xdr);
          
          // First try WalletConnect's signAndSubmitTransaction
          let result;
          
          try {
            // Attempt to use WalletConnect if connected
            if (isWalletConnected) {
              console.log('Using WalletConnect provider to sign transaction');
              result = await signAndSubmitTransaction(xdr);
            }
            // Use Web3Auth or fall back to window method if available
            else if (wallet.isLoggedIn || isWeb3AuthConnected) {
              console.log('Using Web3Auth to sign transaction');
              // Try to sign directly with the private key
              try {
                // Do not use useWallet() hook here - access getPrivateKey from component context
                if (typeof wallet.getPrivateKey === 'function') {
                  // Get the private key
                  const privateKey = await wallet.getPrivateKey();
                  if (!privateKey) {
                    throw new Error('No private key available');
                  }
                  
                  // Create a stellar keypair
                  console.log('Creating Stellar keypair from private key');
                  let keypair;
                  
                  try {
                    // Try direct key usage
                    keypair = StellarSdk.Keypair.fromSecret(privateKey);
                  } catch (keyError) {
                    console.log('Direct keypair creation failed, using deterministic approach');
                    // Use deterministic approach for Web3Auth keys
                    const encoder = new TextEncoder();
                    const data = encoder.encode(privateKey);
                    const hash = await crypto.subtle.digest('SHA-256', data);
                    const seed = new Uint8Array(hash).slice(0, 32);
                    keypair = StellarSdk.Keypair.fromRawEd25519Seed(seed);
                  }
                  
                  // Parse the XDR
                  console.log('Parsing transaction XDR');
                  const networkPassphrase = import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                    ? StellarSdk.Networks.TESTNET 
                    : StellarSdk.Networks.PUBLIC;
                  
                  const transaction = StellarSdk.TransactionBuilder.fromXDR(
                    xdr,
                    networkPassphrase
                  );
                  
                  // Sign the transaction
                  console.log('Signing transaction with keypair');
                  transaction.sign(keypair);
                  
                  // Submit the transaction
                  console.log('Submitting transaction to Stellar');
                  const stellarServer = new StellarSdk.Horizon.Server(
                    import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
                  );
                  
                  result = await stellarServer.submitTransaction(transaction);
                  console.log('Transaction submitted successfully:', result);
                } else {
                  throw new Error('getPrivateKey function not available');
                }
              } catch (directSignError) {
                console.error('Error with direct signing approach:', directSignError);
                
                // Fall back to using the exported function from WalletContext
                try {
                  const { signAndSubmitTransactionFromWalletContext } = await import('../../contexts/WalletContext');
                  if (typeof signAndSubmitTransactionFromWalletContext === 'function') {
                    console.log('Using signAndSubmitTransactionFromWalletContext from WalletContext');
                    result = await signAndSubmitTransactionFromWalletContext(xdr, wallet);
                  } else {
                    throw new Error('Function not available');
                  }
                } catch (importError) {
                  console.error('Error importing from WalletContext:', importError);
                  // Fall back to window method
                  if (window.signAndSubmitTransaction) {
                    console.log('Using window.signAndSubmitTransaction method');
                    result = await window.signAndSubmitTransaction(xdr);
                  } else {
                    throw new Error('No transaction signing method available for Web3Auth');
                  }
                }
              }
            }
            else {
              console.error('Wallet connection check failed:', {
                isWalletConnected,
                walletIsLoggedIn: wallet.isLoggedIn,
                isWeb3AuthConnected,
                publicKey,
                isAuthenticated
              });
              throw new Error('Wallet not connected');
            }
          } catch (error) {
            console.error('Transaction signing and submission error:', error);
            throw error;
          }
          
          console.log('Transaction submitted successfully:', result);
          
          // Return transaction hash
          return result?.hash || result;
        } catch (error) {
          console.error('NFT creation failed:', error);
          throw error;
        }
      };

      // Submit transaction
      console.log('Submitting NFT creation transaction');
      const result = await submitTransaction(operations, 'NFT creation (Open for Bids)');
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
        toast.success('NFT created and open for bids!');

        // Reset form and navigate
        setFormInput({
          price: '',
          name: '',
          description: '',
          assetCode: '',
          minimumBid: '',
          auctionEndDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
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

  // Create NFT with Timed Auction
  async function createTimedAuctionNFT() {
    if (!isAuthenticated) {
      toast.error("Please login first!");
      return;
    }
    
    if (!publicKey) {
      toast.error("No wallet address found! Please reconnect your wallet.");
      return;
    }
    
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting timed auction NFT creation...');

      // Validate form inputs
      const { name, description, minimumBid, assetCode, auctionEndDate } = formInput;
      if (!name || !description || !minimumBid || !assetCode || !selectedFile || !auctionEndDate) {
        throw new Error('Please fill all fields and select an image');
      }

      // Validate auction end date
      const now = new Date();
      if (auctionEndDate <= now) {
        throw new Error('Auction end date must be in the future');
      }

      // Validate and normalize asset code
      const auctionAssetCode = validateAndNormalizeAssetCode(assetCode);

      // Validate and format price
      const validatedPrice = validatePrice(minimumBid);

      // Upload image to IPFS
      setStatusMsg('Uploading image to IPFS...');
      const imageResult = await uploadImage(selectedFile);
      if (!imageResult.success) {
        throw new Error('Failed to upload image to IPFS');
      }
      console.log('Image uploaded as ipfs:', imageResult.url);

      // Prepare and upload metadata
      setStatusMsg('Preparing NFT metadata...');
      const metadata = {
        name,
        description,
        image: imageResult.url,
        minimumBid: validatedPrice,
        creator: publicKey,
        assetCode: auctionAssetCode,
        type: 'timed_auction',
        startTime: now.toISOString(),
        endTime: auctionEndDate.toISOString(),
        created_at: new Date().toISOString(),
        attributes: [
          {
            trait_type: 'Asset Code',
            value: auctionAssetCode,
          },
          {
            trait_type: 'Listing Type',
            value: 'Timed Auction',
          },
          {
            trait_type: 'Auction End',
            value: auctionEndDate.toISOString(),
          },
        ],
      };
      console.log('Metadata being prepared:', metadata);

      const metadataResult = await uploadMetadata(metadata);
      if (!metadataResult.success) {
        throw new Error('Failed to upload metadata to IPFS');
      }
      console.log('Metadata uploaded as ipfs:', metadataResult.url);

      // Create the NFT using Stellar
      setStatusMsg('Creating NFT on Stellar...');

      const networkConfig = {
        network: import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET',
        passphrase:
          import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'
            ? StellarSdk.Networks.TESTNET
            : StellarSdk.Networks.PUBLIC,
      };
      console.log('Using network:', networkConfig.network);

      // Initialize Stellar server
      const server = new StellarSdk.Horizon.Server(import.meta.env.VITE_HORIZON_URL);
      const sourceAccount = await server.loadAccount(publicKey);

      // Check account balance
      const xlmBalance = sourceAccount.balances.find((b) => b.asset_type === 'native');
      if (!xlmBalance) {
        throw new Error('Unable to determine XLM balance');
      }
      const balance = parseFloat(xlmBalance.balance);
      const requiredBalance = 1.5; // Base reserve + buffer for operations
      if (balance < requiredBalance) {
        throw new Error(
          `Insufficient XLM balance. At least ${requiredBalance} XLM required (current: ${balance.toFixed(7)} XLM)`
        );
      }

      // Create the NFT asset
      const nftAsset = new StellarSdk.Asset(auctionAssetCode, publicKey);

      // Build transaction operations
      const operations = [];

      // Payment operation to issue the NFT
      console.log('Adding payment operation');
      operations.push(
        StellarSdk.Operation.payment({
          destination: publicKey,
          asset: nftAsset,
          amount: '1.0000000'
        })
      );

      // ManageData operation for metadata
      if (metadataResult?.hash) {
        console.log('Adding manageData operation');
        const metadataValue = Buffer.from(metadataResult.hash);
        if (metadataValue.length <= 64) {
          operations.push(
            StellarSdk.Operation.manageData({
              name: `nft_${auctionAssetCode}_metadata`,
              value: metadataValue,
            })
          );
        } else {
          console.warn('Metadata value exceeds 64 bytes, skipping metadata operation');
        }
      }

      // Add flag to indicate this is a 'timed auction' NFT
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${auctionAssetCode}_type`,
          value: Buffer.from('timed_auction'),
        })
      );

      // Add auction end time as data entry
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${auctionAssetCode}_end_time`,
          value: Buffer.from(auctionEndDate.toISOString()),
        })
      );

      // Add starting price as data entry
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${auctionAssetCode}_start_price`,
          value: Buffer.from(validatedPrice),
        })
      );

      // Add 'issued' flag as data entry
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${auctionAssetCode}_issued`,
          value: Buffer.from('true'),
        })
      );

      // Create an initial sell offer at the starting price
      operations.push(
        StellarSdk.Operation.manageSellOffer({
          selling: nftAsset,
          buying: StellarSdk.Asset.native(),
          amount: '1',
          price: validatedPrice,
        })
      );

      // Define submitTransaction function within the scope
      const submitTransaction = async (operations, description) => {
        try {
          const stellarServer = new StellarSdk.Horizon.Server(
            import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
          );
          
          // Load account to get the latest sequence number
          const account = await stellarServer.loadAccount(publicKey);
          console.log('Account sequence before NFT creation:', account.sequence);
          
          // Build transaction
          const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: 
              import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                ? StellarSdk.Networks.TESTNET 
                : StellarSdk.Networks.PUBLIC
          });
          
          // Add each operation to the transaction
          operations.forEach((operation, index) => {
            console.log(`Adding operation ${index + 1} to NFT creation: ${JSON.stringify(operation)}`);
            transaction.addOperation(operation);
          });
          
          // Finalize transaction
          const builtTransaction = transaction.setTimeout(180).build();
          const txDetails = {
            operations: operations,
            sequence: builtTransaction.sequence,
            source: builtTransaction.source,
            fee: builtTransaction.fee
          };
          console.log('NFT creation details:', txDetails);
          
          // Convert transaction to XDR format
          const xdr = builtTransaction.toXDR();
          console.log('NFT creation XDR:', xdr);
          
          // First try WalletConnect's signAndSubmitTransaction
          let result;
          
          try {
            // Attempt to use WalletConnect if connected
            if (isWalletConnected) {
              console.log('Using WalletConnect provider to sign transaction');
              result = await signAndSubmitTransaction(xdr);
            }
            // Use Web3Auth or fall back to window method if available
            else if (wallet.isLoggedIn || isWeb3AuthConnected) {
              console.log('Using Web3Auth to sign transaction');
              // Try to sign directly with the private key
              try {
                // Do not use useWallet() hook here - access getPrivateKey from component context
                if (typeof wallet.getPrivateKey === 'function') {
                  // Get the private key
                  const privateKey = await wallet.getPrivateKey();
                  if (!privateKey) {
                    throw new Error('No private key available');
                  }
                  
                  // Create a stellar keypair
                  console.log('Creating Stellar keypair from private key');
                  let keypair;
                  
                  try {
                    // Try direct key usage
                    keypair = StellarSdk.Keypair.fromSecret(privateKey);
                  } catch (keyError) {
                    console.log('Direct keypair creation failed, using deterministic approach');
                    // Use deterministic approach for Web3Auth keys
                    const encoder = new TextEncoder();
                    const data = encoder.encode(privateKey);
                    const hash = await crypto.subtle.digest('SHA-256', data);
                    const seed = new Uint8Array(hash).slice(0, 32);
                    keypair = StellarSdk.Keypair.fromRawEd25519Seed(seed);
                  }
                  
                  // Parse the XDR
                  console.log('Parsing transaction XDR');
                  const networkPassphrase = import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET' 
                    ? StellarSdk.Networks.TESTNET 
                    : StellarSdk.Networks.PUBLIC;
                  
                  const transaction = StellarSdk.TransactionBuilder.fromXDR(
                    xdr,
                    networkPassphrase
                  );
                  
                  // Sign the transaction
                  console.log('Signing transaction with keypair');
                  transaction.sign(keypair);
                  
                  // Submit the transaction
                  console.log('Submitting transaction to Stellar');
                  const stellarServer = new StellarSdk.Horizon.Server(
                    import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org'
                  );
                  
                  result = await stellarServer.submitTransaction(transaction);
                  console.log('Transaction submitted successfully:', result);
                } else {
                  throw new Error('getPrivateKey function not available');
                }
              } catch (directSignError) {
                console.error('Error with direct signing approach:', directSignError);
                
                // Fall back to using the exported function from WalletContext
                try {
                  const { signAndSubmitTransactionFromWalletContext } = await import('../../contexts/WalletContext');
                  if (typeof signAndSubmitTransactionFromWalletContext === 'function') {
                    console.log('Using signAndSubmitTransactionFromWalletContext from WalletContext');
                    result = await signAndSubmitTransactionFromWalletContext(xdr, wallet);
                  } else {
                    throw new Error('Function not available');
                  }
                } catch (importError) {
                  console.error('Error importing from WalletContext:', importError);
                  // Fall back to window method
                  if (window.signAndSubmitTransaction) {
                    console.log('Using window.signAndSubmitTransaction method');
                    result = await window.signAndSubmitTransaction(xdr);
                  } else {
                    throw new Error('No transaction signing method available for Web3Auth');
                  }
                }
              }
            }
            else {
              console.error('Wallet connection check failed:', {
                isWalletConnected,
                walletIsLoggedIn: wallet.isLoggedIn,
                isWeb3AuthConnected,
                publicKey,
                isAuthenticated
              });
              throw new Error('Wallet not connected');
            }
          } catch (error) {
            console.error('Transaction signing and submission error:', error);
            throw error;
          }
          
          console.log('Transaction submitted successfully:', result);
          
          // Return transaction hash
          return result?.hash || result;
        } catch (error) {
          console.error('NFT creation failed:', error);
          throw error;
        }
      };

      // Submit transaction
      console.log('Submitting NFT creation transaction');
      const result = await submitTransaction(operations, 'NFT creation (Timed Auction)');
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
          effect.asset_code === auctionAssetCode &&
          effect.asset_issuer === publicKey
      );

      if (paymentEffect) {
        console.log('NFT issuance verified:', {
          amount: paymentEffect.amount,
          asset: `${paymentEffect.asset_code}:${paymentEffect.asset_issuer}`,
        });
        setStatusMsg('NFT created and verified successfully!');
        toast.success('NFT created with timed auction!');

        // Store auction data in IPFS using AuctionService
        try {
          await AuctionService.createAuction(
            auctionAssetCode,
            publicKey,
            validatedPrice,
            auctionEndDate.toISOString(),
            signAndSubmitTransaction
          );
        } catch (auctionError) {
          console.error('Failed to store auction data:', auctionError);
          // Non-critical error, so we don't throw
        }

        // Reset form and navigate
        setFormInput({
          price: '',
          name: '',
          description: '',
          assetCode: '',
          minimumBid: '',
          auctionEndDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
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

            {!isAuthenticated && (
              <Alert variant="warning">
                <p>Please connect your Stellar wallet to create NFTs.</p>
                <p>You can use Web3Auth login or connect a wallet directly.</p>
              </Alert>
            )}

            {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}
            {statusMsg && <Alert variant="info">{statusMsg}</Alert>}

            <Form>
              <Form.Group className="mb-3">
                <Form.Label>NFT Name</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="NFT Name"
                  value={formInput.name}
                  onChange={e => setFormInput({ ...formInput, name: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="NFT Description"
                  value={formInput.description}
                  onChange={e => setFormInput({ ...formInput, description: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Asset Code (max 12 characters)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Asset Code (e.g., MYNFT)"
                  maxLength={12}
                  value={formInput.assetCode}
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

              <Tabs 
                activeKey={activeTab} 
                onSelect={(k) => setActiveTab(k)}
                className="mb-4 create-nft-tabs"
              >
                <Tab eventKey="fixed-price" title="Fixed Price">
                  <Form.Group className="mt-3 mb-3">
                    <Form.Label>Price (XLM)</Form.Label>
                    <Form.Control
                      type="number"
                      placeholder="NFT Price in XLM"
                      step="0.0000001"
                      min="0"
                      value={formInput.price}
                      onChange={e => setFormInput({ ...formInput, price: e.target.value })}
                    />
                    <Form.Text className="text-muted">
                      Set a fixed price to sell your NFT immediately
                    </Form.Text>
                  </Form.Group>

                  <Button
                    onClick={createNFT}
                    disabled={
                      isLoading ||
                      !formInput.name ||
                      !formInput.description ||
                      !formInput.price ||
                      !formInput.assetCode ||
                      !selectedFile ||
                      !envVarsLoaded
                    }
                    className="d-flex align-items-center justify-content-center gap-2"
                  >
                    {isLoading && <Spinner animation="border" size="sm" />}
                    {isLoading ? 'Creating...' : 'Create Fixed Price NFT'}
                  </Button>
                </Tab>

                <Tab eventKey="open-for-bids" title="Open for Bids">
                  <div className="mt-3 mb-3">
                    <p>Create an NFT that's open for bids from any buyer. You can accept any bid at any time.</p>
                    <Form.Group className="mb-3">
                      <Form.Label>Minimum Bid (XLM)</Form.Label>
                      <Form.Control
                        type="number"
                        placeholder="Minimum acceptable bid in XLM"
                        step="0.0000001"
                        min="0"
                        value={formInput.minimumBid}
                        onChange={e => setFormInput({ ...formInput, minimumBid: e.target.value })}
                      />
                      <Form.Text className="text-muted">
                        Set a minimum bid to ensure your NFT sells at a reasonable price
                      </Form.Text>
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
                        !envVarsLoaded
                      }
                      className="d-flex align-items-center justify-content-center gap-2"
                    >
                      {isLoading && <Spinner animation="border" size="sm" />}
                      {isLoading ? 'Creating...' : 'Create Open Bid NFT'}
                    </Button>
                  </div>
                </Tab>

                <Tab eventKey="timed-auction" title="Timed Auction">
                  <div className="mt-3 mb-3">
                    <p>Create an NFT auction that automatically ends at a specific time.</p>
                    
                    <Form.Group className="mb-3">
                      <Form.Label>Starting Price (XLM)</Form.Label>
                      <Form.Control
                        type="number"
                        placeholder="Starting price in XLM"
                        step="0.0000001"
                        min="0"
                        value={formInput.price}
                        onChange={e => setFormInput({ ...formInput, price: e.target.value })}
                      />
                      <Form.Text className="text-muted">
                        Set a starting price for your auction
                      </Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Auction End Date</Form.Label>
                      <br />
                      <DatePicker
                        selected={formInput.auctionEndDate}
                        onChange={(date) => setFormInput({ ...formInput, auctionEndDate: date })}
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        timeCaption="time"
                        dateFormat="MMMM d, yyyy h:mm aa"
                        minDate={new Date()}
                        className="form-control"
                      />
                      <Form.Text className="text-muted">
                        Select when your auction will end
                      </Form.Text>
                    </Form.Group>

                    <Button
                      onClick={createTimedAuctionNFT}
                      disabled={
                        isLoading ||
                        !formInput.name ||
                        !formInput.description ||
                        !formInput.price ||
                        !formInput.assetCode ||
                        !selectedFile ||
                        !formInput.auctionEndDate ||
                        !envVarsLoaded
                      }
                      className="d-flex align-items-center justify-content-center gap-2"
                    >
                      {isLoading && <Spinner animation="border" size="sm" />}
                      {isLoading ? 'Creating...' : 'Create Timed Auction NFT'}
                    </Button>
                  </div>
                </Tab>
              </Tabs>

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
                      padding: '4px',
                    }}
                  />
                ) : (
                  <p>No image uploaded</p>
                )}
              </div>
              <div className="preview-details">
                <h3>{formInput.name || 'NFT Name'}</h3>
                <p>{formInput.description || 'NFT Description'}</p>
                
                {activeTab === 'fixed-price' && (
                  <p className="price">{formInput.price ? `${formInput.price} XLM` : '0 XLM'}</p>
                )}
                
                {activeTab === 'open-for-bids' && (
                  <p className="price">Minimum Bid: {formInput.minimumBid ? `${formInput.minimumBid} XLM` : '0 XLM'}</p>
                )}
                
                {activeTab === 'timed-auction' && (
                  <>
                    <p className="price">Starting Price: {formInput.price ? `${formInput.price} XLM` : '0 XLM'}</p>
                    <p className="auction-end">Ends: {formInput.auctionEndDate?.toLocaleString() || 'Not set'}</p>
                  </>
                )}
                
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