// Import directly from CDN to avoid webpack build issues
class MoonPayService {
  constructor() {
    this.moonpay = null;
    this.initialized = false;
    this.initializationErrors = [];
    this.publishableKey = process.env.REACT_APP_MOONPAY_PUBLISHABLE_KEY;
    
    // Check both environment variable formats for compatibility
    this.environment = process.env.REACT_APP_MOONPAY_ENVIRONMENT || 
                       process.env.REACT_APP_MOONPAY_ENV || 
                       'sandbox';
                       
    this.baseUrl = this.environment === 'sandbox' ? 'https://buy-sandbox.moonpay.com' : 'https://buy.moonpay.com';
    this.callbacks = {};
    this.maxRetries = 3;
    this.sdkUrls = [
      'https://cdn.moonpay.com/moonpay-sdk.js',
      'https://cdn.moonpay.io/moonpay-sdk.js',
      'https://cdn-widget.moonpay.com/moonpay-sdk.js',
      'https://unpkg.com/@moonpay/moonpay-web-sdk/dist/moonpay-web-sdk.js',
      'https://cdn.jsdelivr.net/npm/@moonpay/moonpay-web-sdk/dist/moonpay-web-sdk.js'
    ];
    this.currentSdkUrlIndex = 0;
    
    // Initialize later to avoid issues with environment variables not being loaded
  }
  
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Check environment variables
      console.log(`Initializing MoonPay with environment: ${this.environment}`);
      console.log(`Environment variables found:`, {
        REACT_APP_MOONPAY_PUBLISHABLE_KEY: process.env.REACT_APP_MOONPAY_PUBLISHABLE_KEY ? 'Yes' : 'No',
        REACT_APP_MOONPAY_ENVIRONMENT: process.env.REACT_APP_MOONPAY_ENVIRONMENT ? 'Yes' : 'No',
        REACT_APP_MOONPAY_ENV: process.env.REACT_APP_MOONPAY_ENV ? 'Yes' : 'No',
        REACT_APP_MOONPAY_API_URL: process.env.REACT_APP_MOONPAY_API_URL ? 'Yes' : 'No'
      });
      
      if (!this.publishableKey) {
        throw new Error('MoonPay publishable key is not configured. Check your .env file.');
      }
      
      try {
        // Try to load the MoonPay SDK with retries
        await this.loadMoonPayScript();
        
        // Fallback to a manual initialization if SDK isn't available
        if (!window.MoonPayWebSdk) {
          console.log('MoonPay Web SDK not found, using direct integration instead');
          this.initialized = true;
          return true;
        }
        
        // Initialize the MoonPay widget if SDK is available
        this.moonpay = window.MoonPayWebSdk.init({
          flow: 'buy',
          environment: this.environment,
          variant: 'overlay',
          apiKey: this.publishableKey,
        });
      } catch (sdkError) {
        console.error('Error loading MoonPay SDK:', sdkError);
        console.log('Continuing with direct URL integration...');
      }
      
      this.initialized = true;
      console.log('[INIT] ✅ MoonPay service initialized successfully');
      return true;
    } catch (error) {
      this.initialized = false;
      console.error('[INIT] ❌ MoonPay service initialization failed:', error.message);
      this.initializationErrors.push(error.message);
      
      // Even if SDK loading fails, we can still use direct URL integration
      console.log('Falling back to direct URL integration');
      this.initialized = true;
      return true;
    }
  }
  
  async loadMoonPayScript(retryCount = 0) {
    // Check if MoonPay SDK script is already loaded
    if (document.getElementById('moonpay-sdk') && window.MoonPayWebSdk) {
      console.log('MoonPay SDK already loaded');
      return;
    }
    
    // Remove any existing failed script tags
    const existingScript = document.getElementById('moonpay-sdk');
    if (existingScript) {
      existingScript.remove();
    }
    
    try {
      // Get the current SDK URL to try
      const sdkUrl = this.sdkUrls[this.currentSdkUrlIndex];
      console.log(`Attempting to load MoonPay SDK from: ${sdkUrl}`);
      
      // Create script element and load MoonPay SDK
      const script = document.createElement('script');
      script.id = 'moonpay-sdk';
      script.src = sdkUrl;
      script.crossOrigin = 'anonymous';
      script.async = true;
      
      // Wait for script to load
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = (error) => {
          console.error('Error loading MoonPay SDK:', error);
          
          // Try the next SDK URL if available
          this.currentSdkUrlIndex = (this.currentSdkUrlIndex + 1) % this.sdkUrls.length;
          reject(new Error('Failed to load MoonPay SDK script'));
        };
        document.head.appendChild(script);
        
        // Set a timeout to prevent infinite hanging
        setTimeout(() => {
          if (!window.MoonPayWebSdk) {
            reject(new Error('MoonPay SDK script load timeout'));
          }
        }, 5000); // 5 second timeout
      });
      
      // Verify the SDK loaded correctly
      if (!window.MoonPayWebSdk) {
        throw new Error('MoonPay SDK failed to initialize properly');
      }
    } catch (error) {
      // Retry logic
      if (retryCount < this.maxRetries) {
        console.log(`Retrying MoonPay SDK load (${retryCount + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return this.loadMoonPayScript(retryCount + 1);
      }
      throw error;
    }
  }
  
  isInitialized() {
    return this.initialized;
  }
  
  getInitializationErrors() {
    return this.initializationErrors;
  }
  
  /**
   * Opens MoonPay modal to buy a specific amount of XLM
   * @param {Object} options - Options for the MoonPay purchase
   * @param {string} options.targetAddress - Wallet address to send XLM to
   * @param {number} options.baseCurrencyAmount - Amount in base currency (USD/EUR) to spend
   * @param {string} options.baseCurrencyCode - Base currency code (default: 'usd')
   * @param {string} options.currencyCode - Currency to buy (default: 'xlm')
   * @param {string} options.email - Optional user email
   * @param {Function} options.onSuccess - Callback function when purchase is successful
   * @param {Function} options.onFailure - Callback function when purchase fails
   * @returns {Promise<void>}
   */
  async buyXLM({
    targetAddress,
    baseCurrencyAmount,
    baseCurrencyCode = 'usd',
    currencyCode = 'xlm',
    email = null,
    onSuccess = () => {},
    onFailure = () => {},
  }) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!targetAddress) {
      throw new Error('Target address is required');
    }
    
    try {
      // Log configuration for debugging
      console.log('MoonPay widget configuration:', {
        baseCurrencyCode,
        baseCurrencyAmount,
        currencyCode,
        walletAddress: targetAddress,
        email,
        environment: this.environment,
        publishableKey: this.publishableKey ? 
          `${this.publishableKey.substring(0, 5)}...` : 'missing'
      });
      
      // Configure event listeners
      if (window.moonPayBuyEventHandler) {
        window.removeEventListener('message', window.moonPayBuyEventHandler);
      }
      
      // Create event handler with more robust event type handling
      window.moonPayBuyEventHandler = (event) => {
        // Check for valid origins
        const validOrigins = [
          'https://buy-sandbox.moonpay.com', 
          'https://buy.moonpay.com',
          'https://www.moonpay.com',
          'https://moonpay.com'
        ];
        
        if (validOrigins.includes(event.origin)) {
          try {
            const { data } = event;
            console.log('MoonPay event received:', data);
            
            // Handle various success event types
            if (data.type === 'moonpay_transaction_success' || 
                data.type === 'moonpay_transaction_completed' ||
                data.type === 'moonpay_payment_complete' ||
                (data.transactionStatus && ['completed', 'success'].includes(data.transactionStatus.toLowerCase()))) {
              console.log('MoonPay transaction successful:', data);
              onSuccess(data);
            } 
            // Handle failure events
            else if (data.type === 'moonpay_transaction_failed' || 
                    (data.transactionStatus && ['failed', 'error'].includes(data.transactionStatus.toLowerCase()))) {
              console.error('MoonPay transaction failed:', data);
              onFailure(new Error(data.message || 'Transaction failed'));
            } 
            // Handle widget close events
            else if (data.type === 'moonpay_widget_close' || 
                    data.type === 'moonpay_overlay_close') {
              console.log('MoonPay widget closed');
            }
          } catch (err) {
            console.error('Error processing MoonPay event:', err);
          }
        }
      };
      
      // Add event listener
      window.addEventListener('message', window.moonPayBuyEventHandler);
      
      // Open MoonPay widget in a new window
      const url = new URL(this.baseUrl);
      url.searchParams.append('apiKey', this.publishableKey);
      url.searchParams.append('currencyCode', currencyCode);
      url.searchParams.append('baseCurrencyCode', baseCurrencyCode);
      url.searchParams.append('baseCurrencyAmount', baseCurrencyAmount);
      url.searchParams.append('walletAddress', targetAddress);
      
      if (email) {
        url.searchParams.append('email', email);
      }
      
      // Optional parameters for better UX
      url.searchParams.append('colorCode', '#3498db');
      url.searchParams.append('showWalletAddressForm', 'false');
      
      // Open in modal
      const width = 450;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        url.toString(),
        'MoonPay',
        `width=${width},height=${height},left=${left},top=${top},location=no,menubar=no,status=no,toolbar=no`
      );
    } catch (error) {
      console.error('Error opening MoonPay widget:', error);
      onFailure(error);
      throw error;
    }
  }
  
  /**
   * Buy an NFT by purchasing the required amount of XLM
   * @param {Object} options - Options for the NFT purchase
   * @param {string} options.targetAddress - Wallet address for the NFT
   * @param {number} options.nftPriceInXLM - Price of the NFT in XLM
   * @param {number} options.xlmPrice - Current XLM price in USD (for conversion)
   * @param {Function} options.onSuccess - Success callback
   * @param {Function} options.onFailure - Failure callback
   * @returns {Promise<void>}
   */
  async buyNFTWithFiat({
    targetAddress,
    nftPriceInXLM,
    xlmPrice = null, // Can be null if getting from API
    email = null,
    onSuccess = () => {},
    onFailure = () => {},
  }) {
    if (!xlmPrice) {
      try {
        // Fetch current XLM price if not provided
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd');
        const data = await response.json();
        xlmPrice = data.stellar.usd;
        console.log(`Current XLM price from API: ${xlmPrice} USD`);
      } catch (error) {
        console.error('Error fetching XLM price:', error);
        xlmPrice = 0.10; // Fallback price (should be updated)
        console.log(`Using fallback XLM price: ${xlmPrice} USD`);
      }
    }
    
    // Calculate the amount in USD
    const usdAmount = nftPriceInXLM * xlmPrice;
    
    // Add a 5% buffer for price fluctuations and fees
    const usdAmountWithBuffer = usdAmount * 1.05;
    
    console.log(`NFT Purchase calculation:`, {
      nftPriceInXLM,
      xlmPrice,
      usdAmount,
      usdAmountWithBuffer
    });
    
    // Call the buyXLM method with the calculated amount
    return this.buyXLM({
      targetAddress,
      baseCurrencyAmount: usdAmountWithBuffer,
      baseCurrencyCode: 'usd',
      currencyCode: 'xlm',
      email,
      onSuccess,
      onFailure,
    });
  }
  
  /**
   * Close the MoonPay widget if it's open
   */
  closeWidget() {
    // Since we're using a popup window, we don't need this method anymore
    console.log('closeWidget called but not needed with popup implementation');
  }
}

// Create and export a singleton instance
const moonpayService = new MoonPayService();
export default moonpayService; 