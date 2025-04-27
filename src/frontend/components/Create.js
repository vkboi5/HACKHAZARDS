import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Alert, Spinner, Tabs, Tab, InputGroup } from 'react-bootstrap';
import * as StellarSdk from '@stellar/stellar-sdk';
import { useWalletConnect } from './WalletConnectProvider';
import axios from 'axios';
import './Create.css';
import { toast } from 'react-hot-toast';
import BidService from './BidService';
import AuctionService from './AuctionService';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const Create = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, signAndSubmitTransaction } = useWalletConnect();
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
    jwt: process.env.REACT_APP_PINATA_JWT,
    gateway: process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/',
    timeout: 60000,
  });
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('fixed-price');

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
    if (!process.env.REACT_APP_PINATA_JWT) missingVars.push('REACT_APP_PINATA_JWT');
    if (!process.env.REACT_APP_IPFS_GATEWAY) missingVars.push('REACT_APP_IPFS_GATEWAY');
    if (!process.env.REACT_APP_STELLAR_NETWORK) missingVars.push('REACT_APP_STELLAR_NETWORK');
    if (!process.env.REACT_APP_HORIZON_URL) missingVars.push('REACT_APP_HORIZON_URL');
    if (!process.env.REACT_APP_ESCROW_ACCOUNT) missingVars.push('REACT_APP_ESCROW_ACCOUNT');

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

    if (!pinataConfig.jwt) {
      console.warn('Pinata JWT not found in environment variables.');
      setErrorMsg('Warning: IPFS configuration missing. Please add REACT_APP_PINATA_JWT to your .env file.');
      return;
    }

    const validatePinataCredentials = async () => {
      try {
        setStatusMsg('Verifying Pinata credentials...');
        const response = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
          headers: {
            'Authorization': `Bearer ${pinataConfig.jwt}`
          },
        });

        if (response.status === 200) {
          console.log('Pinata credentials validated successfully');
          setStatusMsg('Pinata connection established');
          setTimeout(() => setStatusMsg(''), 3000);
        }
      } catch (error) {
        console.error('Pinata credential validation failed:', error);
        setErrorMsg('Error: Invalid Pinata JWT. Please check your REACT_APP_PINATA_JWT in .env file.');
      }
    };

    validatePinataCredentials();
  }, [envVarsLoaded, pinataConfig.jwt]);

  useEffect(() => {
    if (errorMsg && errorMsg.includes('Pinata')) {
      console.info('To fix Pinata issues:');
      console.info('1. Create an account at https://app.pinata.cloud');
      console.info('2. Generate a JWT with admin access at https://app.pinata.cloud/keys');
      console.info('3. Add the JWT to your .env file as REACT_APP_PINATA_JWT');
      console.info('4. Restart the development server');
    }
  }, [errorMsg]);

  const uploadImage = async (file, maxRetries = 3, retryDelay = 2000) => {
    try {
      setStatusMsg('Preparing image upload...');
      console.log(`Image file: ${file.name}, type: ${file.type}, size: ${file.size / 1024} KB`);

      const localUrl = URL.createObjectURL(file);

      if (!pinataConfig.jwt) {
        setStatusMsg('IPFS configuration missing. Using local storage.');
        console.warn('Pinata JWT missing.');
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
                'Authorization': `Bearer ${pinataConfig.jwt}`
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
              errorMessage = 'Authentication failed. Check Pinata JWT.';
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

      if (!pinataConfig.jwt) {
        setStatusMsg('IPFS configuration missing.');
        console.warn('Pinata JWT missing.');
        if (process.env.NODE_ENV === 'development') {
          const localUrl = createLocalFallback();
          console.warn('Using local storage in development mode');
          return { url: localUrl, source: 'local', success: false };
        }
        throw new Error('Pinata JWT not configured.');
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
              version: process.env.REACT_APP_VERSION || '1.0.0',
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
                'Authorization': `Bearer ${pinataConfig.jwt}`
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
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate form inputs
      const { name, description, price, assetCode } = formInput;
      if (!name || !description || !price || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }
      if (!isConnected || !publicKey) {
        throw new Error('Please connect your Stellar wallet');
      }

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

      const validatedAssetCode = validateAndNormalizeAssetCode(assetCode);

      // Validate and format price
      const validatedPrice = validatePrice(price);

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
                : op.type === 'manageSellOffer'
                ? {
                    selling: op.selling.getCode(),
                    buying: op.buying.getCode(),
                    amount: op.amount,
                    price: op.price,
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
                : op.type === 'manageSellOffer'
                ? {
                    selling: op.selling.getCode(),
                    buying: op.buying.getCode(),
                    amount: op.amount,
                    price: op.price,
                  }
                : {}),
            })),
            sequence: built.sequence,
            source: built.source,
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
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate form inputs
      const { name, description, minimumBid, assetCode } = formInput;
      if (!name || !description || !minimumBid || !assetCode || !selectedFile) {
        throw new Error('Please fill all fields and select an image');
      }
      if (!isConnected || !publicKey) {
        throw new Error('Please connect your Stellar wallet');
      }

      // Define validateAndNormalizeAssetCode function within the scope
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
                : op.type === 'manageSellOffer'
                ? {
                    selling: op.selling.getCode(),
                    buying: op.buying.getCode(),
                    amount: op.amount,
                    price: op.price,
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
                : op.type === 'manageSellOffer'
                ? {
                    selling: op.selling.getCode(),
                    buying: op.buying.getCode(),
                    amount: op.amount,
                    price: op.price,
                  }
                : {}),
            })),
            sequence: built.sequence,
            source: built.source,
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
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('Starting NFT creation process...');

      // Validate form inputs
      const { name, description, price, assetCode, auctionEndDate } = formInput;
      if (!name || !description || !price || !assetCode || !selectedFile || !auctionEndDate) {
        throw new Error('Please fill all fields and select an image');
      }
      if (!isConnected || !publicKey) {
        throw new Error('Please connect your Stellar wallet');
      }

      // Validate auction end date
      const now = new Date();
      if (auctionEndDate <= now) {
        throw new Error('Auction end date must be in the future');
      }

      // Define validateAndNormalizeAssetCode function within the scope
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

      // Validate and normalize asset code
      const validatedAssetCode = validateAndNormalizeAssetCode(assetCode);

      // Validate and format price
      const validatedPrice = validatePrice(price);

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
        startingPrice: validatedPrice,
        creator: publicKey,
        assetCode: validatedAssetCode,
        type: 'timed_auction',
        startTime: now.toISOString(),
        endTime: auctionEndDate.toISOString(),
        created_at: new Date().toISOString(),
        attributes: [
          {
            trait_type: 'Asset Code',
            value: validatedAssetCode,
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

      // Add flag to indicate this is a 'timed auction' NFT
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${validatedAssetCode}_type`,
          value: Buffer.from('timed_auction'),
        })
      );

      // Add auction end time as data entry
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${validatedAssetCode}_end_time`,
          value: Buffer.from(auctionEndDate.toISOString()),
        })
      );

      // Add starting price as data entry
      operations.push(
        StellarSdk.Operation.manageData({
          name: `nft_${validatedAssetCode}_start_price`,
          value: Buffer.from(validatedPrice),
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
                : op.type === 'manageSellOffer'
                ? {
                    selling: op.selling.getCode(),
                    buying: op.buying.getCode(),
                    amount: op.amount,
                    price: op.price,
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
                : op.type === 'manageSellOffer'
                ? {
                    selling: op.selling.getCode(),
                    buying: op.buying.getCode(),
                    amount: op.amount,
                    price: op.price,
                  }
                : {}),
            })),
            sequence: built.sequence,
            source: built.source,
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
          effect.asset_code === validatedAssetCode &&
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
            validatedAssetCode,
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