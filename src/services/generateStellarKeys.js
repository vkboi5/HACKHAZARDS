import { Keypair } from 'stellar-sdk';

/**
 * Generates a new Stellar keypair for use as an issuer account
 * @returns {Object} Object containing publicKey and secretKey
 */
export const generateStellarKeys = () => {
  // Generate a new keypair
  const pair = Keypair.random();
  
  return {
    publicKey: pair.publicKey(),
    secretKey: pair.secret()
  };
};

/**
 * Creates a friendbot URL to fund a Stellar account on testnet
 * @param {string} publicKey - The public key of the account to fund
 * @returns {string} The friendbot URL
 */
export const getFriendbotUrl = (publicKey) => {
  return `https://horizon-testnet.stellar.org/friendbot?addr=${publicKey}`;
};

/**
 * Updates the .env file with Stellar credentials
 * Note: This function is for development purposes only
 * In production, use secure key management
 * @param {string} publicKey - The public key to add to .env
 * @param {string} secretKey - The secret key to add to .env
 */
export const updateEnvWithStellarKeys = (publicKey, secretKey) => {
  console.log('Add these keys to your .env file:');
  console.log(`STELLAR_ISSUER_PUBLIC_KEY=${publicKey}`);
  console.log(`STELLAR_ISSUER_SECRET_KEY=${secretKey}`);
  
  // In a real application, you would use a secure method to store these keys
  // For development, you can manually add them to your .env file
};

export default {
  generateStellarKeys,
  getFriendbotUrl,
  updateEnvWithStellarKeys
}; 