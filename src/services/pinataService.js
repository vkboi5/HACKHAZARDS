import axios from 'axios';
import corsProxyService from './corsProxyService';

// Environment variables
const PINATA_API_KEY = process.env.REACT_APP_PINATA_API_KEY;
const PINATA_API_SECRET = process.env.REACT_APP_PINATA_API_SECRET;
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
const PINATA_BASE_URL = 'https://api.pinata.cloud';

class PinataService {
  constructor() {
    this.apiKey = PINATA_API_KEY;
    this.apiSecret = PINATA_API_SECRET;
    this.baseUrl = PINATA_BASE_URL;
    this.ipfsGateway = IPFS_GATEWAY;
    this.errorCount = 0;
    this.maxErrors = 3;
    
    // Initialize the CORS proxy
    this.initializeCorsProxy();
  }
  
  /**
   * Initialize the CORS proxy
   */
  async initializeCorsProxy() {
    try {
      // Find a working CORS proxy
      await corsProxyService.findWorkingProxy();
    } catch (error) {
      console.warn('Error finding working CORS proxy:', error);
    }
  }

  /**
   * Get headers for Pinata API requests
   * @returns {Object} Headers
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'pinata_api_key': this.apiKey,
      'pinata_secret_api_key': this.apiSecret,
    };
    return corsProxyService.createProxiedHeaders(headers);
  }

  /**
   * Get headers for Pinata file upload
   * @returns {Object} Headers
   */
  getFileUploadHeaders() {
    const headers = {
      'pinata_api_key': this.apiKey,
      'pinata_secret_api_key': this.apiSecret,
    };
    return corsProxyService.createProxiedHeaders(headers);
  }

  /**
   * Handle errors from Pinata API
   * @param {Error} error - Error object
   */
  handleError(error, context = 'Pinata operation') {
    this.errorCount++;
    
    // Log the error
    console.error(`${context} error:`, error);
    
    // If we hit the max error count, try rotating the proxy
    if (this.errorCount >= this.maxErrors) {
      corsProxyService.rotateProxy();
      this.errorCount = 0;
    }
    
    // Return a formatted error
    return {
      success: false,
      error: error.message || 'Unknown error',
      details: error.response?.data || error,
    };
  }

  /**
   * Test authentication with Pinata API
   * @returns {Promise<Object>} Authentication status
   */
  async testAuthentication() {
    try {
      const url = corsProxyService.createProxiedUrl(`${this.baseUrl}/data/testAuthentication`);
      const response = await axios.get(url, { headers: this.getHeaders() });
      return { success: true, message: 'Authentication successful', data: response.data };
    } catch (error) {
      return this.handleError(error, 'Pinata authentication test');
    }
  }

  /**
   * Pin JSON data to IPFS via Pinata
   * @param {Object} content - JSON content to pin
   * @param {Object} metadata - Metadata for the pin
   * @returns {Promise<Object>} Pin response
   */
  async pinJSON(content, metadata = {}) {
    try {
      const url = corsProxyService.createProxiedUrl(`${this.baseUrl}/pinning/pinJSONToIPFS`);
      
      const data = {
        pinataMetadata: {
          name: metadata.name || `pin-${Date.now()}`,
          keyvalues: metadata.keyvalues || {},
        },
        pinataContent: content,
      };
      
      const response = await axios.post(url, data, { headers: this.getHeaders() });
      const ipfsHash = response.data.IpfsHash;
      const ipfsUrl = `${this.ipfsGateway}${ipfsHash}`;
      
      return { 
        success: true, 
        ipfsHash, 
        ipfsUrl,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error, 'Pin JSON');
    }
  }

  /**
   * Pin a file to IPFS via Pinata
   * @param {FormData} formData - Form data with file
   * @returns {Promise<Object>} Pin response
   */
  async pinFile(formData) {
    try {
      const url = corsProxyService.createProxiedUrl(`${this.baseUrl}/pinning/pinFileToIPFS`);
      
      const response = await axios.post(url, formData, { 
        headers: this.getFileUploadHeaders(),
        maxContentLength: Infinity,
      });
      
      const ipfsHash = response.data.IpfsHash;
      const ipfsUrl = `${this.ipfsGateway}${ipfsHash}`;
      
      return { 
        success: true, 
        ipfsHash, 
        ipfsUrl,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error, 'Pin file');
    }
  }

  /**
   * Get pins from Pinata
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>} Query results
   */
  async getPins(filters = {}) {
    try {
      let url = `${this.baseUrl}/data/pinList?status=pinned`;
      
      // Add filters to URL
      if (filters.metadata) {
        // Handle metadata keyvalues
        for (const [key, value] of Object.entries(filters.metadata)) {
          const encodedValue = encodeURIComponent(
            JSON.stringify({ value: value, op: 'eq' })
          );
          url += `&metadata[keyvalues][${key}]=${encodedValue}`;
        }
      }
      
      // Add pagination
      if (filters.pageLimit) {
        url += `&pageLimit=${filters.pageLimit}`;
      }
      
      const proxiedUrl = corsProxyService.createProxiedUrl(url);
      console.log('Fetching pins with URL:', proxiedUrl);
      
      const response = await axios.get(proxiedUrl, { 
        headers: this.getHeaders(),
        // Add longer timeout to accommodate proxy
        timeout: 30000
      });
      return { 
        success: true, 
        count: response.data.count,
        pins: response.data.rows,
        data: response.data
      };
    } catch (error) {
      // Try rotating to next CORS proxy on failure
      corsProxyService.rotateProxy(); 
      return this.handleError(error, 'Get pins');
    }
  }
}

// Create a singleton instance
const pinataService = new PinataService();
export default pinataService; 