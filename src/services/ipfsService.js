import axios from 'axios';
import CryptoJS from 'crypto-js';

class IPFSService {
  constructor() {
    this.pinataApiKey = import.meta.env.VITE_PINATA_API_KEY;
    this.pinataSecretKey = import.meta.env.VITE_PINATA_SECRET_KEY;
    this.pinataGateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
  }

  // Encrypt sensitive data using a user-specific key
  encryptData(data, encryptionKey) {
    try {
      if (!data || !encryptionKey) {
        throw new Error('Data and encryption key are required');
      }
      
      const jsonString = typeof data === 'object' ? JSON.stringify(data) : data;
      return CryptoJS.AES.encrypt(jsonString, encryptionKey).toString();
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt wallet data');
    }
  }

  // Decrypt data using the user-specific key
  decryptData(encryptedData, encryptionKey) {
    try {
      if (!encryptedData || !encryptionKey) {
        throw new Error('Encrypted data and key are required');
      }
      
      const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedText) {
        throw new Error('Invalid decryption key or corrupted data');
      }
      
      return JSON.parse(decryptedText);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt wallet data');
    }
  }

  // Generate a unique, deterministic encryption key for a user
  generateUserEncryptionKey(userId, userSecret) {
    try {
      if (!userId || !userSecret) {
        throw new Error('User ID and secret are required for key generation');
      }
      
      // Create a deterministic key based on user ID and a secret they provide/remember
      const baseKey = `${userId}-${userSecret}-galerie-wallet-v1`;
      return CryptoJS.SHA256(baseKey).toString();
    } catch (error) {
      console.error('Key generation error:', error);
      throw new Error('Failed to generate encryption key');
    }
  }

  // Store wallet data in IPFS through Pinata
  async storeWalletData(walletData, userId, userSecret) {
    try {
      if (!this.pinataApiKey || !this.pinataSecretKey) {
        throw new Error('Pinata API keys not configured');
      }
      
      if (!walletData || !userId || !userSecret) {
        throw new Error('Wallet data, user ID, and secret are required');
      }
      
      // Generate encryption key specific to this user
      const encryptionKey = this.generateUserEncryptionKey(userId, userSecret);
      
      // Encrypt the wallet data
      const encryptedData = this.encryptData(walletData, encryptionKey);
      
      // Prepare metadata
      const metadata = {
        name: `galerie-wallet-${userId}`,
        keyvalues: {
          userId: userId,
          timestamp: Date.now(),
          type: 'wallet-data',
          version: '1.0'
        }
      };
      
      // Pin to IPFS via Pinata
      const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
      const response = await axios.post(
        url,
        {
          pinataMetadata: metadata,
          pinataContent: {
            encryptedWalletData: encryptedData
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': this.pinataApiKey,
            'pinata_secret_api_key': this.pinataSecretKey
          }
        }
      );
      
      return {
        cid: response.data.IpfsHash,
        encryptionKey
      };
    } catch (error) {
      console.error('IPFS storage error:', error);
      throw new Error('Failed to store wallet data in IPFS');
    }
  }

  // Retrieve wallet data from IPFS via CID
  async retrieveWalletData(cid, userId, userSecret) {
    try {
      if (!cid || !userId || !userSecret) {
        throw new Error('CID, user ID, and secret are required');
      }
      
      // Generate the same encryption key used for encryption
      const encryptionKey = this.generateUserEncryptionKey(userId, userSecret);
      
      // Fetch data from IPFS gateway
      const gateway = `${this.pinataGateway}/ipfs/${cid}`;
      const response = await axios.get(gateway);
      
      if (!response.data || !response.data.encryptedWalletData) {
        throw new Error('Invalid or missing wallet data in IPFS');
      }
      
      // Decrypt the wallet data
      return this.decryptData(response.data.encryptedWalletData, encryptionKey);
    } catch (error) {
      console.error('IPFS retrieval error:', error);
      throw new Error('Failed to retrieve wallet data from IPFS');
    }
  }
}

export default new IPFSService(); 