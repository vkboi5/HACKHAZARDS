import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';

// Environment variables
const HORIZON_URL = process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;
const PINATA_API_KEY = process.env.REACT_APP_PINATA_API_KEY;
const PINATA_API_SECRET = process.env.REACT_APP_PINATA_API_SECRET;
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
const PINATA_BASE_URL = 'https://api.pinata.cloud';

// Initialize Stellar server
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// Validation utilities
const validatePublicKey = (key, name) => {
  if (!key || !StellarSdk.StrKey.isValidEd25519PublicKey(key)) {
    throw new Error(`Invalid ${name} public key: ${key || 'undefined'}`);
  }
  return key;
};

const validatePrice = (price) => {
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    throw new Error(`Invalid price: ${price || 'undefined'} (must be a positive number)`);
  }
  // Ensure price is formatted as a string with max 7 decimal places
  const formattedPrice = parseFloat(price).toFixed(7).replace(/\.?0+$/, '');
  if (!/^\d+(\.\d{1,7})?$/.test(formattedPrice)) {
    throw new Error(`Price has too many decimal places: ${formattedPrice} (max 7)`);
  }
  console.log('Validated price:', { input: price, output: formattedPrice });
  // Always return as string to ensure compatibility with Stellar SDK
  return String(formattedPrice);
};

class AuctionService {
  // Create a timed auction for an NFT
  static async createAuction(nftAssetCode, ownerPublicKey, startingPrice, endTime, signAndSubmitTransaction) {
    try {
      // Validate inputs
      const validatedOwner = validatePublicKey(ownerPublicKey, 'owner');
      const validatedStartingPrice = validatePrice(startingPrice);
      
      // Validate end time
      const endTimeDate = new Date(endTime);
      if (isNaN(endTimeDate.getTime())) {
        throw new Error('Invalid end time format');
      }
      
      // Ensure end time is in the future
      const now = new Date();
      if (endTimeDate <= now) {
        throw new Error('Auction end time must be in the future');
      }

      console.log('createAuction inputs:', {
        nftAssetCode,
        ownerPublicKey: validatedOwner,
        startingPrice: validatedStartingPrice,
        endTime: endTimeDate.toISOString(),
      });

      // Load owner's account
      const account = await server.loadAccount(validatedOwner);

      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(nftAssetCode, validatedOwner);

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      // Create a sell offer for the NFT at the starting price
      try {
        transaction.addOperation(
          StellarSdk.Operation.manageSellOffer({
            selling: nftAsset,
            buying: StellarSdk.Asset.native(),
            amount: '1',
            price: validatedStartingPrice,
          })
        );
      } catch (opError) {
        console.error('manageSellOffer operation error:', opError);
        throw new Error(`Failed to create manageSellOffer: ${opError.message}`);
      }

      // Add data entry for auction metadata
      const auctionMetadata = {
        type: 'timed_auction',
        startTime: now.toISOString(),
        endTime: endTimeDate.toISOString(),
        startingPrice: validatedStartingPrice,
        status: 'active',
      };

      // Add the metadata as a manageData operation
      const metadataString = JSON.stringify(auctionMetadata);
      if (metadataString.length <= 64) {
        transaction.addOperation(
          StellarSdk.Operation.manageData({
            name: `auction_${nftAssetCode}`,
            value: Buffer.from(metadataString),
          })
        );
      } else {
        console.log('Auction metadata too large for manageData, storing in IPFS');
      }

      // Build and submit transaction
      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);

      console.log('Auction created successfully:', result);

      // Store auction metadata in IPFS for better indexing and retrieval
      const auctionData = {
        nftAssetCode,
        ownerPublicKey: validatedOwner,
        startingPrice: validatedStartingPrice,
        startTime: now.toISOString(),
        endTime: endTimeDate.toISOString(),
        status: 'active',
        txHash: result.hash,
      };

      const ipfsUrl = await this.storeAuctionMetadata(auctionData);

      return {
        ...result,
        auctionData,
        ipfsUrl,
      };
    } catch (error) {
      console.error('Create auction error:', error);
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        let errorMessage = `Transaction failed: ${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          errorMessage += ` - Operations: [${codes.operations.join(', ')}]`;
        }
        throw new Error(errorMessage);
      }
      throw new Error(`Create auction failed: ${error.message}`);
    }
  }

  // Store auction metadata to IPFS
  static async storeAuctionMetadata(auctionData) {
    try {
      if (!PINATA_API_KEY || !PINATA_API_SECRET) {
        console.warn('Pinata credentials missing, skipping metadata storage');
        return null;
      }

      const response = await axios.post(
        `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
        {
          pinataMetadata: {
            name: `auction-${auctionData.nftAssetCode}`,
            keyvalues: {
              app: 'Galerie',
              type: 'auction',
              assetCode: auctionData.nftAssetCode,
              owner: auctionData.ownerPublicKey,
              endTime: auctionData.endTime,
            },
          },
          pinataContent: {
            ...auctionData,
            metadata_version: '1.0',
            created_at: new Date().toISOString(),
          },
        },
        {
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET,
          },
        }
      );

      console.log('Auction metadata stored in IPFS:', response.data.IpfsHash);
      return `${IPFS_GATEWAY}${response.data.IpfsHash}`;
    } catch (error) {
      console.error('Failed to store auction metadata:', error);
      // Non-critical error, so we just log it
      return null;
    }
  }

  // Get auction details for an NFT
  static async getAuctionDetails(nftAssetCode, ownerPublicKey) {
    try {
      const validatedOwner = validatePublicKey(ownerPublicKey, 'owner');
      
      // First try to get the auction details from IPFS
      let auctionData = null;
      
      if (PINATA_API_KEY && PINATA_API_SECRET) {
        try {
          const response = await axios.get(`${PINATA_BASE_URL}/data/pinList`, {
            params: {
              status: 'pinned',
              'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
              'metadata[keyvalues][type]': JSON.stringify({ value: 'auction', op: 'eq' }),
              'metadata[keyvalues][assetCode]': JSON.stringify({ value: nftAssetCode, op: 'eq' }),
              'metadata[keyvalues][owner]': JSON.stringify({ value: validatedOwner, op: 'eq' }),
              pageLimit: 1,
            },
            headers: {
              pinata_api_key: PINATA_API_KEY,
              pinata_secret_api_key: PINATA_API_SECRET,
            },
          });

          if (response.data.rows && response.data.rows.length > 0) {
            const ipfsHash = response.data.rows[0].ipfs_pin_hash;
            const metadataUrl = `${IPFS_GATEWAY}${ipfsHash}`;
            const metadataResponse = await axios.get(metadataUrl);
            auctionData = metadataResponse.data;
          }
        } catch (pinataError) {
          console.error('Pinata fetch error:', pinataError);
        }
      }

      // If we couldn't find the auction data in IPFS, try to get it from the account data
      if (!auctionData) {
        try {
          const account = await server.loadAccount(validatedOwner);
          const data = account.data_attr;
          
          const auctionKey = `auction_${nftAssetCode}`;
          if (data[auctionKey]) {
            const auctionMetadataStr = Buffer.from(data[auctionKey], 'base64').toString();
            auctionData = JSON.parse(auctionMetadataStr);
            auctionData.nftAssetCode = nftAssetCode;
            auctionData.ownerPublicKey = validatedOwner;
          }
        } catch (accountError) {
          console.error('Account data fetch error:', accountError);
        }
      }

      // If we still couldn't find the auction data, check if there's an active offer
      if (!auctionData) {
        try {
          const nftAsset = new StellarSdk.Asset(nftAssetCode, validatedOwner);
          const offersResponse = await server.offers().selling(nftAsset).call();
          
          if (offersResponse.records && offersResponse.records.length > 0) {
            const offer = offersResponse.records[0];
            
            auctionData = {
              nftAssetCode,
              ownerPublicKey: validatedOwner,
              startingPrice: offer.price,
              status: 'active',
              offerId: offer.id,
              isOffer: true, // Flag to indicate this is just a regular offer, not a timed auction
            };
          }
        } catch (offerError) {
          console.error('Offer fetch error:', offerError);
        }
      }

      return auctionData;
    } catch (error) {
      console.error('Get auction details error:', error);
      throw new Error(`Failed to get auction details: ${error.message}`);
    }
  }

  // Check if an auction has ended and finalize it if necessary
  static async checkAndFinalizeAuction(nftAssetCode, ownerPublicKey, signAndSubmitTransaction) {
    try {
      const auctionDetails = await this.getAuctionDetails(nftAssetCode, ownerPublicKey);
      
      if (!auctionDetails) {
        throw new Error('Auction not found');
      }
      
      // Check if the auction has an end time
      if (!auctionDetails.endTime) {
        return { status: 'active', isTimedAuction: false };
      }
      
      const now = new Date();
      const endTime = new Date(auctionDetails.endTime);
      
      // If the auction hasn't ended yet, just return the status
      if (endTime > now) {
        return {
          status: 'active',
          isTimedAuction: true,
          timeRemaining: endTime.getTime() - now.getTime(),
          endTime: endTime.toISOString(),
        };
      }
      
      // The auction has ended, check for the highest bid
      const highestBid = await this.getHighestBid(nftAssetCode, ownerPublicKey);
      
      if (!highestBid) {
        // No bids, cancel the auction
        await this.cancelAuction(nftAssetCode, ownerPublicKey, signAndSubmitTransaction);
        return { status: 'ended', winner: null, isTimedAuction: true };
      }
      
      // Accept the highest bid
      await this.acceptHighestBid(nftAssetCode, ownerPublicKey, highestBid, signAndSubmitTransaction);
      
      return {
        status: 'ended',
        winner: highestBid.bidderPublicKey,
        amount: highestBid.bidAmount,
        isTimedAuction: true,
      };
    } catch (error) {
      console.error('Check and finalize auction error:', error);
      throw new Error(`Failed to check and finalize auction: ${error.message}`);
    }
  }

  // Get the highest bid for an NFT
  static async getHighestBid(nftAssetCode, issuerPublicKey) {
    try {
      const asset = new StellarSdk.Asset(nftAssetCode, issuerPublicKey);
      const offersResponse = await server.offers().buying(asset).call();
      
      if (!offersResponse.records || offersResponse.records.length === 0) {
        return null;
      }
      
      // Sort offers by price (highest first)
      const sortedOffers = offersResponse.records.sort(
        (a, b) => parseFloat(b.price) - parseFloat(a.price)
      );
      
      const highestOffer = sortedOffers[0];
      
      return {
        bidderPublicKey: highestOffer.buyer,
        bidAmount: highestOffer.price,
        offerId: highestOffer.id,
      };
    } catch (error) {
      console.error('Get highest bid error:', error);
      throw new Error(`Failed to get highest bid: ${error.message}`);
    }
  }

  // Accept the highest bid for an auction
  static async acceptHighestBid(nftAssetCode, ownerPublicKey, highestBid, signAndSubmitTransaction) {
    try {
      const validatedOwner = validatePublicKey(ownerPublicKey, 'owner');
      
      // Load owner's account
      const account = await server.loadAccount(validatedOwner);
      
      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(nftAssetCode, validatedOwner);
      
      // Build transaction to sell the NFT at the highest bid price
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      
      // Add manageSellOffer to match the highest bid
      try {
        transaction.addOperation(
          StellarSdk.Operation.manageSellOffer({
            selling: nftAsset,
            buying: StellarSdk.Asset.native(),
            amount: '1',
            price: highestBid.bidAmount,
          })
        );
      } catch (opError) {
        console.error('manageSellOffer operation error:', opError);
        throw new Error(`Failed to create manageSellOffer: ${opError.message}`);
      }
      
      // Remove the auction metadata
      transaction.addOperation(
        StellarSdk.Operation.manageData({
          name: `auction_${nftAssetCode}`,
          value: null,
        })
      );
      
      // Add a record of the auction completion
      transaction.addOperation(
        StellarSdk.Operation.manageData({
          name: `auction_${nftAssetCode}_completed`,
          value: Buffer.from(JSON.stringify({
            winner: highestBid.bidderPublicKey,
            amount: highestBid.bidAmount,
            completedAt: new Date().toISOString(),
          })),
        })
      );
      
      // Build and submit transaction
      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);
      
      console.log('Highest bid accepted successfully:', result);
      
      // Update the auction metadata in IPFS
      await this.updateAuctionStatus(nftAssetCode, ownerPublicKey, 'completed', {
        winner: highestBid.bidderPublicKey,
        finalPrice: highestBid.bidAmount,
      });
      
      return result;
    } catch (error) {
      console.error('Accept highest bid error:', error);
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        let errorMessage = `Transaction failed: ${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          errorMessage += ` - Operations: [${codes.operations.join(', ')}]`;
        }
        throw new Error(errorMessage);
      }
      throw new Error(`Accept highest bid failed: ${error.message}`);
    }
  }

  // Cancel an auction (if no bids or owner decides to cancel)
  static async cancelAuction(nftAssetCode, ownerPublicKey, signAndSubmitTransaction) {
    try {
      const validatedOwner = validatePublicKey(ownerPublicKey, 'owner');
      
      // Load owner's account
      const account = await server.loadAccount(validatedOwner);
      
      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(nftAssetCode, validatedOwner);
      
      // Build transaction to cancel the auction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      
      // Cancel any existing sell offers
      try {
        transaction.addOperation(
          StellarSdk.Operation.manageSellOffer({
            selling: nftAsset,
            buying: StellarSdk.Asset.native(),
            amount: '0',
            price: '1',
            offerId: '0', // This will cancel all offers for this asset
          })
        );
      } catch (opError) {
        console.error('manageSellOffer operation error:', opError);
        throw new Error(`Failed to cancel offer: ${opError.message}`);
      }
      
      // Remove the auction metadata
      transaction.addOperation(
        StellarSdk.Operation.manageData({
          name: `auction_${nftAssetCode}`,
          value: null,
        })
      );
      
      // Add a record of the auction cancellation
      transaction.addOperation(
        StellarSdk.Operation.manageData({
          name: `auction_${nftAssetCode}_cancelled`,
          value: Buffer.from(JSON.stringify({
            cancelledAt: new Date().toISOString(),
          })),
        })
      );
      
      // Build and submit transaction
      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);
      
      console.log('Auction cancelled successfully:', result);
      
      // Update the auction metadata in IPFS
      await this.updateAuctionStatus(nftAssetCode, ownerPublicKey, 'cancelled');
      
      return result;
    } catch (error) {
      console.error('Cancel auction error:', error);
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        let errorMessage = `Transaction failed: ${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          errorMessage += ` - Operations: [${codes.operations.join(', ')}]`;
        }
        throw new Error(errorMessage);
      }
      throw new Error(`Cancel auction failed: ${error.message}`);
    }
  }

  // Update auction status in IPFS
  static async updateAuctionStatus(nftAssetCode, ownerPublicKey, status, additionalData = {}) {
    try {
      if (!PINATA_API_KEY || !PINATA_API_SECRET) {
        console.warn('Pinata credentials missing, skipping metadata update');
        return null;
      }
      
      // Get the existing auction data from IPFS
      let auctionData = null;
      let existingPin = null;
      
      try {
        const response = await axios.get(`${PINATA_BASE_URL}/data/pinList`, {
          params: {
            status: 'pinned',
            'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
            'metadata[keyvalues][type]': JSON.stringify({ value: 'auction', op: 'eq' }),
            'metadata[keyvalues][assetCode]': JSON.stringify({ value: nftAssetCode, op: 'eq' }),
            'metadata[keyvalues][owner]': JSON.stringify({ value: ownerPublicKey, op: 'eq' }),
            pageLimit: 1,
          },
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET,
          },
        });
        
        if (response.data.rows && response.data.rows.length > 0) {
          existingPin = response.data.rows[0];
          const ipfsHash = existingPin.ipfs_pin_hash;
          const metadataUrl = `${IPFS_GATEWAY}${ipfsHash}`;
          const metadataResponse = await axios.get(metadataUrl);
          auctionData = metadataResponse.data;
        }
      } catch (pinataError) {
        console.error('Pinata fetch error:', pinataError);
      }
      
      if (!auctionData) {
        console.warn('No existing auction data found in IPFS');
        return null;
      }
      
      // Update the auction data
      auctionData.status = status;
      auctionData.updatedAt = new Date().toISOString();
      
      // Add any additional data
      Object.assign(auctionData, additionalData);
      
      // Store the updated auction data
      const response = await axios.post(
        `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
        {
          pinataMetadata: {
            name: `auction-${nftAssetCode}-${status}`,
            keyvalues: {
              app: 'Galerie',
              type: 'auction',
              assetCode: nftAssetCode,
              owner: ownerPublicKey,
              status,
            },
          },
          pinataContent: auctionData,
        },
        {
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET,
          },
        }
      );
      
      console.log('Auction status updated in IPFS:', response.data.IpfsHash);
      
      // If there was an existing pin, unpin it
      if (existingPin) {
        try {
          await axios.delete(`${PINATA_BASE_URL}/pinning/unpin/${existingPin.ipfs_pin_hash}`, {
            headers: {
              pinata_api_key: PINATA_API_KEY,
              pinata_secret_api_key: PINATA_API_SECRET,
            },
          });
          console.log('Unpinned old auction data:', existingPin.ipfs_pin_hash);
        } catch (unpinError) {
          console.error('Failed to unpin old auction data:', unpinError);
        }
      }
      
      return `${IPFS_GATEWAY}${response.data.IpfsHash}`;
    } catch (error) {
      console.error('Update auction status error:', error);
      return null;
    }
  }

  // List all active auctions
  static async listActiveAuctions() {
    try {
      const auctions = [];
      
      // Get auctions from IPFS
      if (PINATA_API_KEY && PINATA_API_SECRET) {
        try {
          const response = await axios.get(`${PINATA_BASE_URL}/data/pinList`, {
            params: {
              status: 'pinned',
              'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
              'metadata[keyvalues][type]': JSON.stringify({ value: 'auction', op: 'eq' }),
              'metadata[keyvalues][status]': JSON.stringify({ value: 'active', op: 'eq' }),
              pageLimit: 100,
            },
            headers: {
              pinata_api_key: PINATA_API_KEY,
              pinata_secret_api_key: PINATA_API_SECRET,
            },
          });
          
          const pinataItems = response.data.rows;
          console.log(`Found ${pinataItems.length} active auctions in Pinata`);
          
          for (const item of pinataItems) {
            try {
              const ipfsHash = item.ipfs_pin_hash;
              const metadataUrl = `${IPFS_GATEWAY}${ipfsHash}`;
              const metadataResponse = await axios.get(metadataUrl);
              const auctionData = metadataResponse.data;
              
              // Check if the auction has ended
              const now = new Date();
              const endTime = auctionData.endTime ? new Date(auctionData.endTime) : null;
              
              if (endTime && endTime <= now) {
                // Auction has ended, skip it
                continue;
              }
              
              auctions.push({
                ...auctionData,
                ipfsUrl: metadataUrl,
              });
            } catch (itemError) {
              console.error(`Error processing auction item ${item.ipfs_pin_hash}:`, itemError);
            }
          }
        } catch (pinataError) {
          console.error('Pinata fetch error:', pinataError);
        }
      }
      
      return auctions;
    } catch (error) {
      console.error('List active auctions error:', error);
      throw new Error(`Failed to list active auctions: ${error.message}`);
    }
  }
}

export default AuctionService; 