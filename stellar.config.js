const StellarConfig = {
  // Stellar Network Configuration
  NETWORK: process.env.NODE_ENV === 'production' ? 'PUBLIC' : 'TESTNET',
  
  // Stellar Horizon API endpoints
  HORIZON_URL: process.env.NODE_ENV === 'production' 
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org',
  
  // Stellar Asset Configuration
  ASSET: {
    CODE: 'GALERIE',
    ISSUER: process.env.STELLAR_ISSUER_PUBLIC_KEY, // You'll need to set this in .env
  },
  
  // NFT Configuration
  NFT: {
    COLLECTION_NAME: 'Galerie NFTs',
    COLLECTION_DESCRIPTION: 'Digital Art Collection on Stellar',
  },
  
  // Transaction Configuration
  TRANSACTION: {
    DEFAULT_TIMEOUT: 30, // seconds
    MAX_RETRIES: 3,
  },
  
  // Fee Configuration
  FEES: {
    MARKETPLACE_FEE: 0.025, // 2.5%
    ROYALTY_FEE: 0.05, // 5%
  }
};

export default StellarConfig; 