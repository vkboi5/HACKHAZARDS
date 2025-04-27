const StellarConfig = {
  HORIZON_URL: process.env.REACT_APP_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  NETWORK: process.env.REACT_APP_STELLAR_NETWORK || 'TESTNET',
  NETWORK_PASSPHRASE: process.env.REACT_APP_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  TRANSACTION: {
    FEE: process.env.REACT_APP_STELLAR_TRANSACTION_FEE || '100',
    DEFAULT_TIMEOUT: 180,
    MAX_RETRIES: 3
  },
  ASSET: {
    ISSUER: process.env.STELLAR_ISSUER_PUBLIC_KEY
  }
};

export default StellarConfig; 