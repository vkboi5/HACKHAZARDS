/**
 * Encryption Service for securely handling sensitive wallet data
 * Uses Web Crypto API for encryption/decryption
 */

// Generate a derived encryption key from user credentials
const deriveEncryptionKey = async (userIdentifier) => {
  try {
    // Create a consistent key derivation input from the user identifier
    const encoder = new TextEncoder();
    const data = encoder.encode(userIdentifier);
    
    // Generate a key using SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Import the hash as a CryptoKey
    const key = await crypto.subtle.importKey(
      'raw',
      hashBuffer,
      { name: 'AES-GCM' },
      false, // Not extractable
      ['encrypt', 'decrypt']
    );
    
    return key;
  } catch (error) {
    console.error('Error deriving encryption key:', error);
    throw new Error('Failed to create encryption key');
  }
};

// Encrypt sensitive data
export const encryptData = async (data, userIdentifier) => {
  try {
    // Convert data to string if it's an object
    const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    // Generate encryption key
    const key = await deriveEncryptionKey(userIdentifier);
    
    // Create initialization vector (IV)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the data
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      dataBuffer
    );
    
    // Combine IV and encrypted data into a single array
    const encryptedArray = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    encryptedArray.set(iv, 0);
    encryptedArray.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode(...encryptedArray));
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

// Decrypt sensitive data
export const decryptData = async (encryptedData, userIdentifier) => {
  try {
    // Convert from base64
    const encryptedString = atob(encryptedData);
    const encryptedArray = new Uint8Array(encryptedString.length);
    
    for (let i = 0; i < encryptedString.length; i++) {
      encryptedArray[i] = encryptedString.charCodeAt(i);
    }
    
    // Extract IV (first 12 bytes)
    const iv = encryptedArray.slice(0, 12);
    const encryptedBuffer = encryptedArray.slice(12);
    
    // Generate decryption key (same process as encryption)
    const key = await deriveEncryptionKey(userIdentifier);
    
    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      encryptedBuffer
    );
    
    // Convert decrypted buffer to string
    const decoder = new TextDecoder();
    const decryptedString = decoder.decode(decryptedBuffer);
    
    // Try to parse as JSON if possible
    try {
      return JSON.parse(decryptedString);
    } catch {
      return decryptedString;
    }
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}; 