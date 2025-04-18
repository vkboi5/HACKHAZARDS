import { Server, Asset, Keypair, TransactionBuilder, Operation } from 'stellar-sdk';
import StellarConfig from '../../stellar.config';

class StellarService {
  constructor() {
    this.server = new Server(StellarConfig.HORIZON_URL);
    this.networkPassphrase = StellarConfig.NETWORK === 'PUBLIC' 
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';
  }

  // Initialize a new Stellar account
  async createAccount() {
    try {
      const pair = Keypair.random();
      const response = await fetch(
        `${StellarConfig.HORIZON_URL}/friendbot?addr=${pair.publicKey()}`
      );
      const result = await response.json();
      return {
        publicKey: pair.publicKey(),
        secretKey: pair.secret(),
        result
      };
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  }

  // Get account details
  async getAccount(publicKey) {
    try {
      return await this.server.loadAccount(publicKey);
    } catch (error) {
      console.error('Error loading account:', error);
      throw error;
    }
  }

  // Create NFT (as a Stellar asset)
  async createNFT(name, description, totalSupply) {
    try {
      const issuer = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
      const asset = new Asset(name, issuer.publicKey());
      
      // Create trustline and mint tokens
      const transaction = new TransactionBuilder(await this.getAccount(issuer.publicKey()), {
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(Operation.changeTrust({
          asset: asset,
          limit: totalSupply.toString()
        }))
        .addOperation(Operation.payment({
          destination: issuer.publicKey(),
          asset: asset,
          amount: totalSupply.toString()
        }))
        .setTimeout(StellarConfig.TRANSACTION.DEFAULT_TIMEOUT)
        .build();

      transaction.sign(issuer);
      return await this.server.submitTransaction(transaction);
    } catch (error) {
      console.error('Error creating NFT:', error);
      throw error;
    }
  }

  // Transfer NFT
  async transferNFT(fromSecret, toPublicKey, assetCode, amount) {
    try {
      const source = Keypair.fromSecret(fromSecret);
      const asset = new Asset(assetCode, StellarConfig.ASSET.ISSUER);
      
      const transaction = new TransactionBuilder(await this.getAccount(source.publicKey()), {
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(Operation.payment({
          destination: toPublicKey,
          asset: asset,
          amount: amount.toString()
        }))
        .setTimeout(StellarConfig.TRANSACTION.DEFAULT_TIMEOUT)
        .build();

      transaction.sign(source);
      return await this.server.submitTransaction(transaction);
    } catch (error) {
      console.error('Error transferring NFT:', error);
      throw error;
    }
  }

  // Get NFT balance
  async getNFTBalance(publicKey, assetCode) {
    try {
      const account = await this.getAccount(publicKey);
      const asset = new Asset(assetCode, StellarConfig.ASSET.ISSUER);
      const balance = account.balances.find(b => 
        b.asset_type !== 'native' && 
        b.asset_code === asset.getCode() && 
        b.asset_issuer === asset.getIssuer()
      );
      return balance ? balance.balance : '0';
    } catch (error) {
      console.error('Error getting NFT balance:', error);
      throw error;
    }
  }

  // Get transaction history
  async getTransactionHistory(publicKey) {
    try {
      return await this.server.transactions()
        .forAccount(publicKey)
        .call();
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }
}

export default new StellarService(); 