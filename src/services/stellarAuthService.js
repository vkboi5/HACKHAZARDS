import { Keypair, Networks, Horizon } from '@stellar/stellar-sdk';
import axios from 'axios';

class StellarAuthService {
  constructor() {
    this.server = new Horizon.Server(process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org');
    this.networkPassphrase = process.env.NODE_ENV === 'production' 
      ? Networks.PUBLIC 
      : Networks.TESTNET;
  }

  /**
   * Creates or retrieves a Stellar account for a Web3Auth user
   * @param {string} privateKey - The private key from Web3Auth
   * @param {string} email - The user's email from Web3Auth
   * @returns {Promise<{publicKey: string, secretKey: string}>}
   */
  async createStellarAccountFromWeb3Auth(privateKey, email) {
    try {
      // Check if we have a stored account for this email
      const storedAccount = localStorage.getItem(`stellar_account_${email}`);
      if (storedAccount) {
        const account = JSON.parse(storedAccount);
        console.log('Retrieved existing Stellar account for:', email);
        
        // Check if account exists and has balance
        try {
          const accountDetails = await this.server.loadAccount(account.publicKey);
          const xlmBalance = accountDetails.balances.find(b => b.asset_type === 'native');
          console.log('Existing account balance:', xlmBalance ? `${xlmBalance.balance} XLM` : '0 XLM');
          
          // If account has no balance, fund it
          if (!xlmBalance || parseFloat(xlmBalance.balance) === 0) {
            if (process.env.NODE_ENV !== 'production') {
              try {
                await this.fundAccountWithFriendbot(account.publicKey);
                console.log('Funded existing account with Friendbot');
              } catch (fundError) {
                console.error('Friendbot funding failed for existing account:', fundError);
              }
            }
          }
          
          return account;
        } catch (error) {
          console.error('Error loading existing account:', error);
          // If account doesn't exist, proceed with creating a new one
        }
      }

      // Generate a new Stellar keypair
      const keypair = Keypair.random();
      
      // Check if account already exists
      try {
        await this.server.loadAccount(keypair.publicKey());
        console.log('Stellar account already exists');
        return {
          publicKey: keypair.publicKey(),
          secretKey: keypair.secret()
        };
      } catch (error) {
        if (error.response && error.response.status === 404) {
          // Account doesn't exist, proceed with creation
          console.log('Creating new Stellar account');
        } else {
          throw error;
        }
      }

      // Fund the account using Friendbot (testnet only)
      if (process.env.NODE_ENV !== 'production') {
        try {
          await this.fundAccountWithFriendbot(keypair.publicKey());
        } catch (fundError) {
          console.error('Friendbot funding failed, but continuing with account creation:', fundError);
        }
      }

      // Log account details and balance
      try {
        const account = await this.server.loadAccount(keypair.publicKey());
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        console.log('Created Stellar Account:');
        console.log('Public Key:', keypair.publicKey());
        console.log('Balance:', xlmBalance ? `${xlmBalance.balance} XLM` : '0 XLM');
        console.log('Account ID:', account.id);
      } catch (error) {
        console.error('Error loading account details:', error);
      }

      // Store the account details with the email
      const accountDetails = {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret()
      };
      localStorage.setItem(`stellar_account_${email}`, JSON.stringify(accountDetails));

      return accountDetails;
    } catch (error) {
      console.error('Error creating Stellar account:', error);
      throw new Error(`Failed to create Stellar account: ${error.message}`);
    }
  }

  /**
   * Funds a Stellar account using Friendbot (testnet only)
   * @param {string} publicKey - The public key to fund
   * @returns {Promise<void>}
   */
  async fundAccountWithFriendbot(publicKey) {
    try {
      console.log('Requesting funding from Friendbot for:', publicKey);
      const response = await axios.get(`https://friendbot.stellar.org?addr=${publicKey}`);
      
      if (response.status === 200) {
        console.log('Friendbot response:', response.data);
        if (response.data.successful) {
          console.log('Account funded successfully with Friendbot');
          return;
        }
      }
      
      // If we get here, something went wrong
      console.error('Friendbot response:', response.data);
      throw new Error(`Friendbot funding failed: ${response.data.detail || 'Unknown error'}`);
    } catch (error) {
      console.error('Error funding account with Friendbot:', error);
      if (error.response) {
        console.error('Friendbot error response:', error.response.data);
        throw new Error(`Failed to fund account: ${error.response.data.detail || error.message}`);
      }
      throw new Error(`Failed to fund account: ${error.message}`);
    }
  }

  /**
   * Checks if a Stellar account exists
   * @param {string} publicKey - The public key to check
   * @returns {Promise<boolean>}
   */
  async accountExists(publicKey) {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the XLM balance of an account
   * @param {string} publicKey - The public key to check
   * @returns {Promise<number>}
   */
  async getXlmBalance(publicKey) {
    try {
      const account = await this.server.loadAccount(publicKey);
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      return xlmBalance ? parseFloat(xlmBalance.balance) : 0;
    } catch (error) {
      console.error('Error getting XLM balance:', error);
      throw new Error(`Failed to get XLM balance: ${error.message}`);
    }
  }
}

export default new StellarAuthService(); 