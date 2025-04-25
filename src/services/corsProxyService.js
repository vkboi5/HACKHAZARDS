/**
 * CORS Proxy Service
 * 
 * This service acts as a middleware for APIs that have CORS restrictions.
 * It provides methods to route API requests through a CORS proxy to avoid CORS errors.
 */

// List of CORS proxies
const PROXY_URLS = [
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
  'https://api.allorigins.win/raw?url=',
  'https://proxy.cors.sh/',
  'https://cors-proxy.fringe.zone/'
];

class CorsProxyService {
  constructor() {
    this.currentProxyIndex = 0;
    this.proxyEnabled = true; // Set to false to disable proxy
  }

  /**
   * Gets the current proxy URL
   * @returns {string} Current proxy URL
   */
  getCurrentProxy() {
    return PROXY_URLS[this.currentProxyIndex];
  }

  /**
   * Rotates to the next proxy in the list
   */
  rotateProxy() {
    this.currentProxyIndex = (this.currentProxyIndex + 1) % PROXY_URLS.length;
    console.log(`Switched to CORS proxy: ${this.getCurrentProxy()}`);
  }

  /**
   * Tests all proxies and selects the fastest working one
   * @returns {Promise<string>} The URL of the working proxy
   */
  async findWorkingProxy() {
    console.log('Testing CORS proxies to find working one...');
    
    // URL to test with - using Pinata test auth endpoint
    const testUrl = 'https://api.pinata.cloud/data/testAuthentication';
    
    for (let i = 0; i < PROXY_URLS.length; i++) {
      const proxyUrl = PROXY_URLS[i];
      try {
        console.log(`Testing proxy: ${proxyUrl}`);
        const proxiedUrl = `${proxyUrl}${testUrl}`;
        
        // Set short timeout to quickly identify working proxies
        const response = await fetch(proxiedUrl, { 
          method: 'HEAD',
          timeout: 3000
        });
        
        if (response.ok || response.status === 200) {
          console.log(`✅ Found working proxy: ${proxyUrl}`);
          this.currentProxyIndex = i;
          return proxyUrl;
        }
      } catch (error) {
        console.warn(`❌ Proxy failed: ${proxyUrl}`, error.message);
      }
    }
    
    console.warn('⚠️ No working proxy found, using default');
    return this.getCurrentProxy();
  }

  /**
   * Creates a proxied URL
   * @param {string} url - The original URL to proxy
   * @returns {string} The proxied URL
   */
  createProxiedUrl(url) {
    if (!this.proxyEnabled) return url;
    
    const proxy = this.getCurrentProxy();
    // For allorigins we need to encode the URL
    if (proxy.includes('allorigins')) {
      return `${proxy}${encodeURIComponent(url)}`;
    }
    return `${proxy}${url}`;
  }

  /**
   * Creates headers for the proxied request
   * @param {Object} originalHeaders - Original headers
   * @returns {Object} Modified headers for the proxy
   */
  createProxiedHeaders(originalHeaders = {}) {
    const headers = { ...originalHeaders };
    
    // Add necessary headers for CORS proxy
    if (this.proxyEnabled) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    
    return headers;
  }
}

// Create a singleton instance
const corsProxyService = new CorsProxyService();
export default corsProxyService; 