import { Keypair, Networks, TransactionBuilder, Operation } from '@stellar/stellar-sdk';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';

// Constants
const STELLAR_TESTNET_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const XLM_AIRDROP_AMOUNT = '10000'; // Amount in XLM to airdrop

class Web3AuthStellarService {
  constructor() {
    this.server = new StellarSdk.Horizon.Server(STELLAR_TESTNET_URL);
    this.networkPassphrase = Networks.TESTNET;
  }

  /**
   * Create a Stellar wallet from Web3Auth private key
   * @param {string} privateKey - Private key from Web3Auth
   * @returns {object} - The keypair and wallet details
   */
  async createStellarWallet(privateKey) {
    try {
      console.log("Creating Stellar wallet with private key format:", 
        typeof privateKey, 
        privateKey ? `length: ${privateKey.length}` : 'null');
      
      // Web3Auth returns a hex private key that needs to be converted for Stellar
      let stellarKeypair;
      
      // Try different approaches to create a valid Stellar keypair
      try {
        // First attempt: Try using the key directly if it's already in Stellar format
        stellarKeypair = Keypair.fromSecret(privateKey);
      } catch (directError) {
        console.log("Direct key conversion failed, trying alternate methods");
        
        try {
          // Second attempt: Try to convert from hex (typical Web3Auth format)
          // Remove '0x' prefix if present
          const hexKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
          
          // Create a new random keypair
          const randomKeypair = Keypair.random();
          
          // Use the hex key to seed a new keypair
          const seed = Buffer.from(hexKey.slice(0, 32), 'hex');
          stellarKeypair = Keypair.fromRawEd25519Seed(seed);
          
          console.log("Successfully created Stellar keypair from hex private key");
        } catch (conversionError) {
          console.error("Conversion from hex failed:", conversionError);
          
          // Last resort: Generate a deterministic keypair based on the Web3Auth key
          // This ensures the same Web3Auth login always yields the same Stellar account
          const hash = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(privateKey)
          );
          const seed = new Uint8Array(hash).slice(0, 32);
          stellarKeypair = Keypair.fromRawEd25519Seed(seed);
          console.log("Created deterministic Stellar keypair from key hash");
        }
      }
      
      const publicKey = stellarKeypair.publicKey();
      console.log(`Created Stellar wallet with public key: ${publicKey}`);
      
      // Check if account exists
      try {
        await this.server.loadAccount(publicKey);
        console.log('Account already exists on the Stellar network');
        return { publicKey, keypair: stellarKeypair, isNew: false };
      } catch (error) {
        if (error.response && error.response.status === 404) {
          // Account doesn't exist, we'll need to fund it
          console.log('Account does not exist on the Stellar network, will be created');
          return { publicKey, keypair: stellarKeypair, isNew: true };
        }
        throw error;
      }
    } catch (error) {
      console.error('Error creating Stellar wallet:', error);
      throw new Error(`Failed to create Stellar wallet: ${error.message}`);
    }
  }

  /**
   * Airdrop XLM to a new Stellar account using Friendbot
   * @param {string} publicKey - The public key to fund
   * @returns {object} - The transaction result
   */
  async airdropXLM(publicKey) {
    try {
      console.log(`Airdropping XLM to account: ${publicKey}`);
      
      const response = await axios.get(`${FRIENDBOT_URL}?addr=${publicKey}`);
      console.log('Airdrop successful:', response.data);
      
      return {
        success: true,
        hash: response.data.hash,
        amount: XLM_AIRDROP_AMOUNT,
        message: `Successfully airdropped ${XLM_AIRDROP_AMOUNT} XLM to ${publicKey}`
      };
    } catch (error) {
      console.error('Error airdropping XLM:', error);
      throw new Error(`Failed to airdrop XLM: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Get account balance
   * @param {string} publicKey - The public key to check
   * @returns {object} - The account balances
   */
  async getAccountBalance(publicKey) {
    try {
      const account = await this.server.loadAccount(publicKey);
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      
      return {
        xlm: xlmBalance ? xlmBalance.balance : '0',
        balances: account.balances
      };
    } catch (error) {
      console.error('Error getting account balance:', error);
      throw new Error(`Failed to get account balance: ${error.message}`);
    }
  }

  /**
   * Initialize Moonpay for purchasing XLM with fiat
   * @param {string} publicKey - The recipient public key 
   * @param {number} amount - The amount to purchase in XLM or price of NFT
   * @param {object} nftDetails - Optional NFT details for direct NFT purchase
   * @returns {object} - The Moonpay URL
   */
  async initializeMoonpayPurchase(publicKey, amount = 10, nftDetails = null) {
    try {
      if (!publicKey) {
        throw new Error('Public key is required');
      }
      
      // MoonPay configuration
      const apiKey = import.meta.env.VITE_MOONPAY_API_KEY;
      if (!apiKey) {
        throw new Error('MoonPay API key is not configured');
      }
      
      const environment = import.meta.env.VITE_MOONPAY_ENVIRONMENT || 'sandbox';
      
      // Base URL for MoonPay widget - for both regular and NFT purchases
      const baseUrl = environment === 'production' 
        ? 'https://buy.moonpay.com' 
        : 'https://buy-sandbox.moonpay.com';
      
      // Get real-time XLM to USD conversion rate
      let xlmToUsdRate = 0.11; // Default fallback rate
      try {
        // Attempt to get real-time rate with timeout and error handling
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd', {
          timeout: 5000, // 5 second timeout
          validateStatus: status => status === 200, // Only accept 200 OK responses
        }).catch(error => {
          console.warn('CoinGecko API request failed:', error.message);
          return null; // Return null so we can check for it and use fallback
        });
        
        // Check if we got a valid response with data
        if (response && response.data && response.data.stellar && response.data.stellar.usd) {
          xlmToUsdRate = response.data.stellar.usd;
          console.log(`Current XLM to USD rate: $${xlmToUsdRate}`);
        } else {
          console.warn('Failed to get valid XLM rate data from CoinGecko, using fallback rate');
        }
      } catch (rateError) {
        // Fallback to a default rate if API fails
        console.warn('Failed to get real-time XLM rate, using fallback rate:', xlmToUsdRate, rateError);
      }
      
      // For NFT purchases - we'll convert the XLM amount to USD
      let fiatAmount = amount;
      
      // If amount is provided, use it as the XLM price that needs conversion
      if (amount && amount > 0) {
        fiatAmount = (amount * xlmToUsdRate).toFixed(2);
        console.log(`Converting ${amount} XLM to approximately $${fiatAmount} USD`);
      }
      
      // Setup MoonPay parameters for XLM purchase
      const params = new URLSearchParams({
        apiKey,
        currencyCode: 'xlm',
        walletAddress: publicKey,
        baseCurrencyAmount: fiatAmount,
        baseCurrencyCode: 'usd', // Default to USD
        redirectURL: window.location.origin
      });
      
      // Generate the URL for regular XLM purchase
      const url = `${baseUrl}?${params.toString()}`;
      
      // Return configuration for client-side initialization
      return {
        url,
        apiKey,
        currencyCode: 'xlm',
        walletAddress: publicKey,
        baseCurrencyAmount: fiatAmount,
        baseCurrencyCode: 'usd',
        environment,
        redirectURL: window.location.origin,
        // Add NFT details if provided (for reference only)
        nftDetails: nftDetails ? {
          id: nftDetails.id,
          name: nftDetails.name,
          image: nftDetails.image
        } : null
      };
    } catch (error) {
      console.error('Error initializing Moonpay purchase:', error);
      throw new Error(`Failed to initialize Moonpay purchase: ${error.message}`);
    }
  }
}

export default new Web3AuthStellarService(); 