/**
 * Wallet Storage Service
 * Handles secure storage of wallet data in IPFS via Pinata
 */

import axios from 'axios';
import { encryptData, decryptData } from './encryptionService';

// Pinata API credentials from environment variables
const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY;
const PINATA_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

/**
 * Store wallet data securely in IPFS using Pinata
 * @param {string} publicKey - The wallet's public key
 * @param {object} walletData - The wallet data to store (including private key)
 * @param {string} userIdentifier - A unique identifier for the user (for encryption)
 * @returns {Promise<string>} - The IPFS CID of the stored data
 */
export const storeWalletData = async (publicKey, walletData, userIdentifier) => {
  try {
    if (!publicKey) {
      throw new Error('Public key is required');
    }
    
    if (!walletData) {
      throw new Error('Wallet data is required');
    }
    
    // Use the provided identifier or fall back to public key
    const encryptionKey = userIdentifier || publicKey;
    
    // Encrypt the wallet data
    const encryptedData = await encryptData(walletData, encryptionKey);
    
    // Create metadata for Pinata
    const metadata = {
      name: `wallet-data-${publicKey.slice(0, 8)}`,
      keyvalues: {
        publicKey: publicKey,
        createdAt: new Date().toISOString(),
        type: 'stellar-wallet'
      }
    };
    
    // Prepare the data for Pinata
    const data = {
      pinataMetadata: metadata,
      pinataContent: {
        encryptedData,
        publicKey,
        version: '1.0.0'
      }
    };
    
    // Pin to IPFS via Pinata
    const response = await axios.post(PINATA_URL, data, {
      headers: {
        'Content-Type': 'application/json',
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_KEY
      }
    });
    
    if (response.status === 200) {
      const ipfsCid = response.data.IpfsHash;
      
      // Store the CID reference in localStorage
      const walletRefs = JSON.parse(localStorage.getItem('walletRefs') || '{}');
      walletRefs[publicKey] = ipfsCid;
      localStorage.setItem('walletRefs', JSON.stringify(walletRefs));
      
      console.log(`Wallet data stored in IPFS with CID: ${ipfsCid}`);
      return ipfsCid;
    } else {
      throw new Error(`Failed to store in IPFS: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error storing wallet data in IPFS:', error);
    throw error;
  }
};

/**
 * Retrieve wallet data from IPFS
 * @param {string} publicKey - The wallet's public key
 * @param {string} userIdentifier - The same identifier used during encryption
 * @returns {Promise<object>} - The decrypted wallet data
 */
export const retrieveWalletData = async (publicKey, userIdentifier) => {
  try {
    if (!publicKey) {
      throw new Error('Public key is required');
    }
    
    // Get the IPFS CID from localStorage
    const walletRefs = JSON.parse(localStorage.getItem('walletRefs') || '{}');
    const ipfsCid = walletRefs[publicKey];
    
    if (!ipfsCid) {
      throw new Error('No IPFS reference found for this wallet');
    }
    
    // Fetch the data from IPFS (using a gateway)
    const ipfsGatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;
    const response = await axios.get(ipfsGatewayUrl);
    
    if (response.status !== 200) {
      throw new Error(`Failed to retrieve from IPFS: ${response.statusText}`);
    }
    
    const { encryptedData } = response.data.pinataContent;
    
    if (!encryptedData) {
      throw new Error('No encrypted data found in IPFS');
    }
    
    // Use the provided identifier or fall back to public key
    const decryptionKey = userIdentifier || publicKey;
    
    // Decrypt the wallet data
    const decryptedData = await decryptData(encryptedData, decryptionKey);
    console.log('Wallet data retrieved and decrypted successfully');
    
    return decryptedData;
  } catch (error) {
    console.error('Error retrieving wallet data from IPFS:', error);
    throw error;
  }
};

/**
 * Delete wallet data from IPFS
 * @param {string} publicKey - The wallet's public key
 * @param {string} userIdentifier - The same identifier used during encryption (not used for deletion, but kept for consistency)
 * @returns {Promise<boolean>} - True if successful
 */
export const deleteWalletData = async (publicKey, userIdentifier = null) => {
  try {
    if (!publicKey) {
      throw new Error('Public key is required');
    }
    
    // Get the IPFS CID from localStorage
    const walletRefs = JSON.parse(localStorage.getItem('walletRefs') || '{}');
    const ipfsCid = walletRefs[publicKey];
    
    if (!ipfsCid) {
      console.log('No IPFS reference found for this wallet, nothing to delete');
      return true;
    }
    
    // Unpin from Pinata
    const unpinUrl = `https://api.pinata.cloud/pinning/unpin/${ipfsCid}`;
    const response = await axios.delete(unpinUrl, {
      headers: {
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_KEY
      }
    });
    
    if (response.status === 200) {
      // Remove the reference from localStorage
      delete walletRefs[publicKey];
      localStorage.setItem('walletRefs', JSON.stringify(walletRefs));
      console.log(`Wallet data with CID ${ipfsCid} unpinned from IPFS`);
      return true;
    } else {
      throw new Error(`Failed to unpin from IPFS: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error deleting wallet data from IPFS:', error);
    throw error;
  }
}; 