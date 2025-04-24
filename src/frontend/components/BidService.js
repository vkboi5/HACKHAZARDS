import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';

// Environment variables
const HORIZON_URL = process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.REACT_APP_STELLAR_NETWORK === 'TESTNET'
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;
const ESCROW_ACCOUNT = process.env.REACT_APP_ESCROW_ACCOUNT;
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

class BidService {
  // Place a bid on an NFT
  static async placeBid(nftAssetCode, issuerPublicKey, bidderPublicKey, bidAmount, signAndSubmitTransaction) {
    try {
      // Validate inputs
      const validatedBidder = validatePublicKey(bidderPublicKey, 'bidder');
      const validatedIssuer = validatePublicKey(issuerPublicKey, 'issuer');
      const validatedBidAmount = validatePrice(bidAmount);

      console.log('placeBid inputs:', {
        nftAssetCode,
        bidderPublicKey: validatedBidder,
        bidAmount: validatedBidAmount,
        issuerPublicKey: validatedIssuer,
      });

      // Load bidder's account
      const account = await server.loadAccount(validatedBidder);

      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(nftAssetCode, validatedIssuer);

      // Check if bidder has trustline for the NFT
      const hasTrustline = account.balances.some(
        (b) => b.asset_code === nftAssetCode && b.asset_issuer === validatedIssuer
      );

      // Check XLM balance
      const xlmBalance = parseFloat(account.balances.find((b) => b.asset_type === 'native').balance);
      if (xlmBalance < parseFloat(validatedBidAmount) + 1.0) {
        throw new Error(`Insufficient XLM balance: ${xlmBalance} XLM`);
      }

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      // Add trustline if needed
      if (!hasTrustline) {
        transaction.addOperation(
          StellarSdk.Operation.changeTrust({
            asset: nftAsset,
          })
        );
      }

      // Add manageBuyOffer operation for the bid
      try {
        console.log('manageBuyOffer parameters:', {
          selling: 'XLM',
          buying: `${nftAssetCode}:${validatedIssuer}`,
          buyAmount: '1',
          price: validatedBidAmount,
        });
        transaction.addOperation(
          StellarSdk.Operation.manageBuyOffer({
            selling: StellarSdk.Asset.native(),
            buying: nftAsset,
            buyAmount: '1',
            price: validatedBidAmount,
          })
        );
      } catch (opError) {
        console.error('manageBuyOffer operation error:', opError);
        throw new Error(`Failed to create manageBuyOffer: ${opError.message}`);
      }

      // Add data entry for bid metadata (timestamp)
      const timestamp = new Date().toISOString();
      transaction.addOperation(
        StellarSdk.Operation.manageData({
          name: `bid_${nftAssetCode}_${validatedBidder.slice(0, 10)}`,
          value: Buffer.from(timestamp),
        })
      );

      // Build and submit transaction
      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);

      console.log('Bid placed successfully:', result);

      // Store bid information in IPFS for better indexing and retrieval
      await this.storeBidMetadata({
        nftAssetCode,
        issuerPublicKey: validatedIssuer,
        bidderPublicKey: validatedBidder,
        bidAmount: validatedBidAmount,
        timestamp,
        txHash: result.hash,
      });

      return result;
    } catch (error) {
      console.error('Place bid error:', error);
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        let errorMessage = `Transaction failed: ${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          errorMessage += ` - Operations: [${codes.operations.join(', ')}]`;
        }
        throw new Error(errorMessage);
      }
      throw new Error(`Place bid failed: ${error.message}`);
    }
  }

  // Store bid metadata to IPFS
  static async storeBidMetadata(bidData) {
    try {
      if (!PINATA_API_KEY || !PINATA_API_SECRET) {
        console.warn('Pinata credentials missing, skipping metadata storage');
        return;
      }

      const response = await axios.post(
        `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
        {
          pinataMetadata: {
            name: `bid-${bidData.nftAssetCode}-${bidData.bidderPublicKey.slice(0, 10)}`,
            keyvalues: {
              app: 'Galerie',
              type: 'bid',
              assetCode: bidData.nftAssetCode,
              issuer: bidData.issuerPublicKey,
              bidder: bidData.bidderPublicKey,
            },
          },
          pinataContent: {
            ...bidData,
            bid_type: 'open',
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

      console.log('Bid metadata stored in IPFS:', response.data.IpfsHash);
      return `${IPFS_GATEWAY}${response.data.IpfsHash}`;
    } catch (error) {
      console.error('Failed to store bid metadata:', error);
      // Non-critical error, so we just log it
      return null;
    }
  }

  // Get bids for an NFT
  static async getBidsForNFT(nftAssetCode, issuerPublicKey) {
    try {
      const bids = [];

      // Query from Pinata
      if (PINATA_API_KEY && PINATA_API_SECRET) {
        try {
          const response = await axios.get(`${PINATA_BASE_URL}/data/pinList`, {
            params: {
              status: 'pinned',
              'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
              'metadata[keyvalues][type]': JSON.stringify({ value: 'bid', op: 'eq' }),
              'metadata[keyvalues][assetCode]': JSON.stringify({ value: nftAssetCode, op: 'eq' }),
              'metadata[keyvalues][issuer]': JSON.stringify({ value: issuerPublicKey, op: 'eq' }),
              pageLimit: 100,
            },
            headers: {
              pinata_api_key: PINATA_API_KEY,
              pinata_secret_api_key: PINATA_API_SECRET,
            },
          });

          const pinataItems = response.data.rows;
          console.log(`Found ${pinataItems.length} bids for ${nftAssetCode} in Pinata`);

          for (const item of pinataItems) {
            try {
              const ipfsHash = item.ipfs_pin_hash;
              const metadataUrl = `${IPFS_GATEWAY}${ipfsHash}`;
              const metadataResponse = await axios.get(metadataUrl);
              const bidData = metadataResponse.data;

              bids.push({
                id: ipfsHash,
                nftAssetCode: bidData.nftAssetCode,
                issuerPublicKey: bidData.issuerPublicKey,
                bidderPublicKey: bidData.bidderPublicKey,
                bidAmount: bidData.bidAmount,
                timestamp: bidData.timestamp,
                txHash: bidData.txHash,
              });
            } catch (itemError) {
              console.error(`Error processing bid item ${item.ipfs_pin_hash}:`, itemError);
            }
          }
        } catch (pinataError) {
          console.error('Pinata fetch error:', pinataError);
        }
      }

      // Look for offers on the SDEX as a fallback/verification
      try {
        // Query offers buying the NFT asset
        const asset = new StellarSdk.Asset(nftAssetCode, issuerPublicKey);
        const offersResponse = await server.offers().buying(asset).call();
        
        const offers = offersResponse.records;
        console.log(`Found ${offers.length} offers for ${nftAssetCode} on SDEX`);

        for (const offer of offers) {
          // Check if this offer is already in our bids array
          const existingBid = bids.find(
            (bid) => bid.bidderPublicKey === offer.buyer && 
                    parseFloat(bid.bidAmount) === parseFloat(offer.price)
          );

          if (!existingBid) {
            bids.push({
              id: offer.id,
              nftAssetCode,
              issuerPublicKey,
              bidderPublicKey: offer.buyer,
              bidAmount: offer.price,
              timestamp: offer.last_modified_time,
              txHash: null, // Not available from SDEX data
              source: 'sdex',
            });
          }
        }
      } catch (sdexError) {
        console.error('SDEX offers fetch error:', sdexError);
      }

      // Sort bids by amount (highest first)
      bids.sort((a, b) => parseFloat(b.bidAmount) - parseFloat(a.bidAmount));
      
      return bids;
    } catch (error) {
      console.error('Get bids error:', error);
      throw new Error(`Failed to get bids: ${error.message}`);
    }
  }

  // Accept a bid (for NFT owner)
  static async acceptBid(nftAssetCode, ownerPublicKey, bidderPublicKey, bidAmount, signAndSubmitTransaction) {
    try {
      // Validate inputs
      const validatedOwner = validatePublicKey(ownerPublicKey, 'owner');
      const validatedBidder = validatePublicKey(bidderPublicKey, 'bidder');
      const validatedBidAmount = validatePrice(bidAmount);

      console.log('acceptBid inputs:', {
        nftAssetCode,
        ownerPublicKey: validatedOwner,
        bidderPublicKey: validatedBidder,
        bidAmount: validatedBidAmount
      });

      // Load owner's account
      const account = await server.loadAccount(validatedOwner);

      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(nftAssetCode, validatedOwner);

      // Build transaction to sell the NFT at the bid price
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      // Add manageSellOffer to match the bid
      try {
        transaction.addOperation(
          StellarSdk.Operation.manageSellOffer({
            selling: nftAsset,
            buying: StellarSdk.Asset.native(),
            amount: '1',
            price: validatedBidAmount,
          })
        );
      } catch (opError) {
        console.error('manageSellOffer operation error:', opError);
        throw new Error(`Failed to create manageSellOffer: ${opError.message}`);
      }

      // Build and submit transaction
      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);

      console.log('Bid accepted successfully:', result);
      return result;
    } catch (error) {
      console.error('Accept bid error:', error);
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        let errorMessage = `Transaction failed: ${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          errorMessage += ` - Operations: [${codes.operations.join(', ')}]`;
        }
        throw new Error(errorMessage);
      }
      throw new Error(`Accept bid failed: ${error.message}`);
    }
  }
}

export default BidService; 