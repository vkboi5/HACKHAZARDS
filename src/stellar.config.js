// Check required environment variables
const requiredEnvVars = {
  STELLAR_ISSUER_PUBLIC_KEY: process.env.STELLAR_ISSUER_PUBLIC_KEY,
  STELLAR_ISSUER_SECRET_KEY: process.env.STELLAR_ISSUER_SECRET_KEY,
};

// Log missing environment variables
const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  console.warn(`⚠️ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('Some Stellar operations may fail. Please check your .env file.');
}

const StellarConfig = {
  // Stellar Network Configuration
  NETWORK: process.env.REACT_APP_STELLAR_NETWORK || (process.env.NODE_ENV === 'production' ? 'PUBLIC' : 'TESTNET'),
  
  // Stellar Horizon API endpoints - allow override from env vars
  HORIZON_URL: process.env.REACT_APP_HORIZON_URL || (process.env.NODE_ENV === 'production' 
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'),
  
  // Network passphrase (will be determined automatically based on NETWORK)
  get NETWORK_PASSPHRASE() {
    return this.NETWORK === 'PUBLIC' 
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';
  },
  
  // Stellar Asset Configuration
  ASSET: {
    CODE: 'GALERIE',
    ISSUER: process.env.STELLAR_ISSUER_PUBLIC_KEY || '',
    // Add validation function
    isConfigured() {
      return !!this.ISSUER;
    }
  },
  
  // NFT Configuration
  NFT: {
    COLLECTION_NAME: 'Galerie NFTs',
    COLLECTION_DESCRIPTION: 'Digital Art Collection on Stellar',
  },
  
  // Transaction Configuration
  TRANSACTION: {
    // Increase timeout for potentially slow transactions
    DEFAULT_TIMEOUT: 180, // seconds (increased from 30)
    MAX_RETRIES: 3,
    // Add base fee configuration (in stroops)
    FEE: '100', // Base fee in stroops (0.00001 XLM)
    // Default number of operations to include in the transaction
    BATCH_SIZE: 5, 
    // Add retry configuration
    RETRY: {
      // Initial delay in milliseconds
      INITIAL_DELAY: 1000, 
      // Maximum delay in milliseconds
      MAX_DELAY: 10000,
      // Factor to increase delay on each retry
      BACKOFF_FACTOR: 2,
      // Whether to use jitter to randomize delay times
      USE_JITTER: true,
    },
    // Add fee bump configuration
    FEE_BUMP: {
      // Enable fee bumping for failed transactions
      ENABLED: true,
      // Multiplier for fee bumping
      MULTIPLIER: 2,
      // Maximum fee to use for bumping
      MAX_FEE: '10000', // 0.001 XLM
    }
  },
  
  // Fee Configuration
  FEES: {
    MARKETPLACE_FEE: 0.025, // 2.5%
    ROYALTY_FEE: 0.05, // 5%
  },
  
  // Configuration for network specific settings
  NETWORK_CONFIG: {
    PUBLIC: {
      MIN_ACCOUNT_BALANCE: '1', // Minimum XLM balance
      RECOMMENDED_ACCOUNT_BALANCE: '5', // Recommended XLM balance
      FRIENDBOT_AVAILABLE: false,
    },
    TESTNET: {
      MIN_ACCOUNT_BALANCE: '1', // Minimum XLM balance
      RECOMMENDED_ACCOUNT_BALANCE: '5', // Recommended XLM balance
      FRIENDBOT_AVAILABLE: true,
      FRIENDBOT_URL: 'https://friendbot.stellar.org',
    }
  },
  
  // Helper function to get network-specific configuration
  getNetworkConfig() {
    return this.NETWORK_CONFIG[this.NETWORK] || this.NETWORK_CONFIG.TESTNET;
  },
  
  // Validation function to check if configuration is valid
  isValid() {
    const missingKeys = [];
    
    if (!this.ASSET.isConfigured()) {
      missingKeys.push('ASSET.ISSUER (STELLAR_ISSUER_PUBLIC_KEY)');
    }
    
    if (!process.env.STELLAR_ISSUER_SECRET_KEY) {
      missingKeys.push('STELLAR_ISSUER_SECRET_KEY');
    }
    
    if (missingKeys.length > 0) {
      console.error(`Missing required configuration: ${missingKeys.join(', ')}`);
      return false;
    }
    
    return true;
  }
};

export default StellarConfig;
