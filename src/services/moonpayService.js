import axios from 'axios';
import { ethers } from 'ethers';
import { NFT_CONTRACT_ABI, NFT_CONTRACT_ADDRESS } from '../config/contracts';

class MoonPayService {
  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(process.env.REACT_APP_ETHEREUM_NETWORK);
    this.contract = new ethers.Contract(
      NFT_CONTRACT_ADDRESS,
      NFT_CONTRACT_ABI,
      this.provider
    );
  }

  async verifyTransaction(transactionId) {
    try {
      const response = await axios.get(
        `https://api.moonpay.com/v1/transactions/${transactionId}`,
        {
          headers: {
            'Authorization': `Api-Key ${process.env.REACT_APP_MOONPAY_API_KEY}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error verifying MoonPay transaction:', error);
      throw error;
    }
  }

  async handleWebhook(payload) {
    try {
      const { transactionId, status, cryptoAmount, walletAddress, nftId } = payload;

      // Verify the transaction with MoonPay
      const transaction = await this.verifyTransaction(transactionId);

      if (status === 'completed' && transaction.status === 'completed') {
        // Execute NFT transfer
        await this.transferNFT(nftId, walletAddress, cryptoAmount);
        return { success: true, message: 'NFT transferred successfully' };
      }

      return { success: false, message: 'Transaction not completed' };
    } catch (error) {
      console.error('Error handling MoonPay webhook:', error);
      throw error;
    }
  }

  async transferNFT(nftId, buyerAddress, amount) {
    try {
      // Get the seller's address from the NFT contract
      const sellerAddress = await this.contract.ownerOf(nftId);

      // Create a transaction to transfer the NFT
      const tx = await this.contract.transferFrom(
        sellerAddress,
        buyerAddress,
        nftId,
        {
          value: ethers.utils.parseEther(amount.toString())
        }
      );

      // Wait for the transaction to be mined
      await tx.wait();

      return tx.hash;
    } catch (error) {
      console.error('Error transferring NFT:', error);
      throw error;
    }
  }
}

export default new MoonPayService(); 