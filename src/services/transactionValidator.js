import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * Validates a Stellar transaction XDR
 * @param {string} xdr - The XDR string to validate
 * @param {string} networkPassphrase - The network passphrase (testnet or public)
 * @returns {object} The parsed transaction if valid
 * @throws {Error} If the XDR is invalid
 */
export const validateTransactionXdr = (xdr, networkPassphrase) => {
  if (!xdr || typeof xdr !== 'string') {
    throw new Error('Invalid XDR: must be a non-empty string');
  }

  try {
    // Attempt to parse the XDR
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      xdr,
      networkPassphrase
    );
    
    // Basic validation - check that the transaction has operations
    if (!transaction.operations || transaction.operations.length === 0) {
      throw new Error('Transaction must contain at least one operation');
    }
    
    // Return the parsed transaction
    return transaction;
  } catch (error) {
    throw new Error(`Invalid Stellar transaction XDR: ${error.message}`);
  }
};

/**
 * Validates and formats a transaction for WalletConnect
 * @param {string} xdr - The XDR string to validate and format
 * @param {string} networkPassphrase - The network passphrase
 * @returns {object} Object containing properly formatted data for WalletConnect
 */
export const prepareTransactionForWalletConnect = (xdr, networkPassphrase) => {
  // First validate the XDR
  const transaction = validateTransactionXdr(xdr, networkPassphrase);
  
  // Extract transaction details for logging/debugging
  const txDetails = {
    sequence: transaction.sequence,
    source: transaction.source,
    fee: transaction.fee,
    operationCount: transaction.operations.length,
    networkPassphrase
  };
  
  console.log('Transaction prepared for WalletConnect:', txDetails);
  
  // IMPORTANT: LOBSTR wallet expects this specific format
  return {
    xdr,
    network: networkPassphrase === StellarSdk.Networks.TESTNET ? 'testnet' : 'public',
    publicKey: transaction.source,
    operations: transaction.operations.length
  };
};

/**
 * Validates a transaction signature response from a wallet
 * @param {object} response - The response from the wallet
 * @returns {boolean} True if the signature is valid
 */
export const validateSignatureResponse = (response) => {
  if (!response) {
    return false;
  }
  
  // Check for expected properties in the response
  if (response.signedXDR && typeof response.signedXDR === 'string') {
    return true;
  }
  
  return false;
};

/**
 * Formats a proper response for a sign request from LOBSTR wallet
 * @param {string} xdr - The XDR string from the sign request
 * @param {string} networkPassphrase - The network passphrase
 * @returns {object} Object containing properly formatted data for WalletConnect response
 */
export const formatSignResponse = (xdr, networkPassphrase) => {
  try {
    // Validate the XDR first to ensure it's proper format
    validateTransactionXdr(xdr, networkPassphrase);
    
    // Format response in the way LOBSTR expects it
    return {
      signedXDR: xdr
    };
  } catch (error) {
    throw new Error(`Cannot format sign response: ${error.message}`);
  }
};

export default {
  validateTransactionXdr,
  prepareTransactionForWalletConnect,
  validateSignatureResponse,
  formatSignResponse
}; 