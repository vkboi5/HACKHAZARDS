import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';

// Environment variables
const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;
const ESCROW_ACCOUNT = import.meta.env.VITE_ESCROW_ACCOUNT;
const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_API_SECRET = import.meta.env.VITE_PINATA_API_SECRET;
const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
const PINATA_BASE_URL = 'https://api.pinata.cloud';

// Debug: Log StellarSdk to inspect exports
console.log('StellarSdk:', StellarSdk);

// Initialize Stellar server
if (!StellarSdk.Horizon?.Server) {
  throw new Error('StellarSdk.Horizon.Server is not available. Check @stellar/stellar-sdk version and imports.');
}
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// Validation utilities
const validateAssetCode = (rawAssetCode) => {
  if (!rawAssetCode || typeof rawAssetCode !== 'string') {
    throw new Error('Asset code must be a non-empty string');
  }
  const assetCode = rawAssetCode.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
  if (!assetCode) {
    throw new Error('Asset code is required');
  }
  if (assetCode.length < 1 || assetCode.length > 12) {
    throw new Error(`Asset code length invalid: ${assetCode.length} (must be 1-12 characters)`);
  }
  if (!/^[A-Z0-9]+$/.test(assetCode)) {
    throw new Error(`Asset code contains invalid characters: ${assetCode} (must be uppercase alphanumeric)`);
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

class MarketplaceService {
  static async buyNFT(nftAssetCode, buyerPublicKey, price, issuerPublicKey, signAndSubmitTransaction) {
    try {
      // Validate environment variables
      if (!ESCROW_ACCOUNT || !StellarSdk.StrKey.isValidEd25519PublicKey(ESCROW_ACCOUNT)) {
        throw new Error('Escrow account is not configured or invalid in environment variables');
      }

      // Validate inputs
      const validatedAssetCode = validateAssetCode(nftAssetCode);
      const validatedBuyer = validatePublicKey(buyerPublicKey, 'buyer');
      const validatedIssuer = validatePublicKey(issuerPublicKey, 'issuer');
      const validatedPrice = validatePrice(price);

      console.log('buyNFT inputs:', {
        nftAssetCode: validatedAssetCode,
        buyerPublicKey: validatedBuyer,
        price: validatedPrice,
        issuerPublicKey: validatedIssuer,
        escrowAccount: ESCROW_ACCOUNT,
      });

      // Load buyer's account
      const account = await server.loadAccount(validatedBuyer);

      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(validatedAssetCode, validatedIssuer);

      // Check trustline
      const hasTrustline = account.balances.some(
        (b) => b.asset_code === validatedAssetCode && b.asset_issuer === validatedIssuer
      );

      // Check XLM balance (reserve 1 XLM for fees and trustline)
      const xlmBalance = parseFloat(account.balances.find((b) => b.asset_type === 'native').balance);
      if (xlmBalance < parseFloat(validatedPrice) + 1.0) {
        throw new Error(`Insufficient XLM balance: ${xlmBalance} XLM`);
      }

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      if (!hasTrustline) {
        transaction.addOperation(
          StellarSdk.Operation.changeTrust({
            asset: nftAsset,
          })
        );
      }

      transaction.addOperation(
        StellarSdk.Operation.payment({
          destination: ESCROW_ACCOUNT,
          asset: StellarSdk.Asset.native(),
          amount: validatedPrice,
        })
      );

      // Add manageBuyOffer with error handling
      try {
        console.log('manageBuyOffer parameters:', {
          selling: 'XLM',
          buying: `${validatedAssetCode}:${validatedIssuer}`,
          buyAmount: '1',
          buyAmountType: typeof '1',
          price: validatedPrice,
          priceType: typeof validatedPrice,
          priceDecimals: validatedPrice.includes('.') ? validatedPrice.split('.')[1].length : 0,
        });
        transaction.addOperation(
          StellarSdk.Operation.manageBuyOffer({
            selling: StellarSdk.Asset.native(),
            buying: nftAsset,
            buyAmount: '1',
            price: validatedPrice,
          })
        );
      } catch (opError) {
        console.error('manageBuyOffer operation error:', opError);
        throw new Error(`Failed to create manageBuyOffer: ${opError.message}`);
      }

      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);

      console.log('Buy NFT transaction successful:', result);
      return result;
    } catch (error) {
      console.error('Buy NFT error:', error);
      if (error.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        let errorMessage = `Transaction failed: ${codes.transaction || 'Unknown error'}`;
        if (codes.operations) {
          errorMessage += ` - Operations: [${codes.operations.join(', ')}]`;
        }
        throw new Error(errorMessage);
      }
      throw new Error(`Buy NFT failed: ${error.message}`);
    }
  }

  static async issueNFT(issuerPublicKey, assetCode, metadata, signAndSubmitTransaction) {
    try {
      // Validate inputs
      const validatedAssetCode = validateAssetCode(assetCode);
      const validatedIssuer = validatePublicKey(issuerPublicKey, 'issuer');
      if (!metadata || typeof metadata !== 'object') {
        throw new Error('Metadata must be a non-empty object');
      }
      if (!metadata.name || !metadata.image) {
        throw new Error('Metadata must include name and image');
      }

      console.log('issueNFT inputs:', {
        assetCode: validatedAssetCode,
        issuerPublicKey: validatedIssuer,
        metadata,
      });

      // Upload metadata to Pinata
      let metadataUrl;
      try {
        const pinataResponse = await axios.post(
          `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
          {
            pinataMetadata: {
              name: `nft-${validatedAssetCode}`,
              keyvalues: {
                app: 'Galerie',
                assetCode: validatedAssetCode,
                issuer: validatedIssuer,
              },
            },
            pinataContent: {
              ...metadata,
              assetCode: validatedAssetCode,
              creator: validatedIssuer,
              created_at: new Date().toISOString(),
              storage_type: 'ipfs',
            },
          },
          {
            headers: {
              pinata_api_key: PINATA_API_KEY,
              pinata_secret_api_key: PINATA_API_SECRET,
            },
          }
        );

        if (!pinataResponse.data.IpfsHash) {
          throw new Error('Failed to get IPFS hash from Pinata');
        }
        metadataUrl = `${IPFS_GATEWAY}${pinataResponse.data.IpfsHash}`;
        console.log('Metadata uploaded to IPFS:', metadataUrl);
      } catch (pinataError) {
        console.error('Pinata upload error:', pinataError);
        throw new Error(`Failed to upload metadata to Pinata: ${pinataError.message}`);
      }

      // Load issuer's account
      const account = await server.loadAccount(validatedIssuer);

      // Create NFT asset
      const nftAsset = new StellarSdk.Asset(validatedAssetCode, validatedIssuer);

      // Encode metadata URL
      const encodedMetadata = Buffer.from(metadataUrl).toString('base64');

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          StellarSdk.Operation.manageData({
            name: `nft_${validatedAssetCode}`,
            value: encodedMetadata,
          })
        )
        .addOperation(
          StellarSdk.Operation.manageData({
            name: `nft_${validatedAssetCode}_issued`,
            value: Buffer.from('true').toString('base64'),
          })
        )
        .addOperation(
          StellarSdk.Operation.payment({
            destination: validatedIssuer,
            asset: nftAsset,
            amount: '1',
          })
        );

      const builtTx = transaction.setTimeout(180).build();
      const xdr = builtTx.toXDR();
      const result = await signAndSubmitTransaction(xdr);

      console.log('Issue NFT transaction successful:', result);
      return { result, metadataUrl };
    } catch (error) {
      console.error('Issue NFT error:', error);
      throw new Error(`Issue NFT failed: ${error.message}`);
    }
  }

  static async listNFTs(accountIds = []) {
    try {
      const nftItems = [];

      // Validate account IDs
      const validatedAccountIds = accountIds
        .filter(id => id && StellarSdk.StrKey.isValidEd25519PublicKey(id))
        .map(id => validatePublicKey(id, 'account'));

      if (validatedAccountIds.length === 0) {
        console.log('No valid account IDs provided, scanning Pinata for all NFTs');
      }

      // Fetch from Pinata
      try {
        const response = await axios.get(`${PINATA_BASE_URL}/data/pinList`, {
          params: {
            status: 'pinned',
            'metadata[keyvalues][app]': JSON.stringify({ value: 'Galerie', op: 'eq' }),
            pageLimit: 100,
          },
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_API_SECRET,
          },
        });

        const pinataItems = response.data.rows;
        console.log(`Found ${pinataItems.length} pinned items`);

        for (const item of pinataItems) {
          try {
            const ipfsHash = item.ipfs_pin_hash;
            const metadataUrl = `${IPFS_GATEWAY}${ipfsHash}`;
            const metadataResponse = await axios.get(metadataUrl);
            const nftData = metadataResponse.data;

            if (!nftData.name || !nftData.image || !nftData.creator) {
              console.warn(`Skipping invalid metadata for ${ipfsHash}`);
              continue;
            }

            const validatedCreator = validatePublicKey(nftData.creator, 'creator');
            const validatedAssetCode = validateAssetCode(nftData.assetCode || ipfsHash);

            if (validatedAccountIds.length > 0 && !validatedAccountIds.includes(validatedCreator)) {
              continue; // Skip if not in requested accounts
            }

            let isVerifiedOnStellar = false;
            try {
              const account = await server.loadAccount(validatedCreator);
              const data = account.data_attr;
              if (data[`nft_${validatedAssetCode}`] && data[`nft_${validatedAssetCode}_issued`]) {
                isVerifiedOnStellar = true;
              }
            } catch (accountError) {
              console.warn(`Could not verify ${validatedCreator} on Stellar: ${accountError.message}`);
            }

            nftItems.push({
              id: `${validatedCreator}-${validatedAssetCode}`,
              accountId: validatedCreator,
              name: nftData.name,
              description: nftData.description || 'No description',
              image: nftData.image.startsWith('http') ? nftData.image : `${IPFS_GATEWAY}${nftData.image}`,
              creator: validatedCreator,
              price: nftData.price || '0',
              assetCode: validatedAssetCode,
              storageType: nftData.storage_type || 'ipfs',
              isVerifiedOnStellar,
            });
          } catch (itemError) {
            console.error(`Error processing Pinata item ${item.ipfs_pin_hash}:`, itemError);
          }
        }
      } catch (pinataError) {
        console.error('Pinata fetch error:', pinataError);
      }

      // Fallback to Stellar accounts
      for (const accountId of validatedAccountIds) {
        try {
          const account = await server.loadAccount(accountId);
          const data = account.data_attr;

          for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('nft_') && !key.endsWith('_issued')) {
              const assetCode = key.replace('nft_', '');
              const issuedKey = `nft_${assetCode}_issued`;
              if (data[issuedKey] && Buffer.from(data[issuedKey], 'base64').toString() === 'true') {
                try {
                  const metadataUrl = Buffer.from(value, 'base64').toString();
                  const metadataResponse = await axios.get(metadataUrl.startsWith('http') ? metadataUrl : `${IPFS_GATEWAY}${metadataUrl}`);
                  const nftData = metadataResponse.data;

                  if (!nftData.name || !nftData.image || !nftData.creator) {
                    console.warn(`Skipping invalid metadata for ${assetCode}`);
                    continue;
                  }

                  const validatedCreator = validatePublicKey(nftData.creator, 'creator');
                  const validatedAssetCode = validateAssetCode(nftData.assetCode || assetCode);

                  nftItems.push({
                    id: `${validatedCreator}-${validatedAssetCode}`,
                    accountId: validatedCreator,
                    name: nftData.name,
                    description: nftData.description || 'No description',
                    image: nftData.image.startsWith('http') ? nftData.image : `${IPFS_GATEWAY}${nftData.image}`,
                    creator: validatedCreator,
                    price: nftData.price || '0',
                    assetCode: validatedAssetCode,
                    storageType: nftData.storage_type || 'ipfs',
                    isVerifiedOnStellar: true,
                  });
                } catch (metadataError) {
                  console.error(`Error fetching metadata for ${assetCode}:`, metadataError);
                }
              }
            }
          }
        } catch (accountError) {
          console.error(`Error loading account ${accountId}:`, accountError);
        }
      }

      console.log(`Total NFTs found: ${nftItems.length}`);
      return nftItems;
    } catch (error) {
      console.error('List NFTs error:', error);
      throw new Error(`Failed to list NFTs: ${error.message}`);
    }
  }
}

export default MarketplaceService;