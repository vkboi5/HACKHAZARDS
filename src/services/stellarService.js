import { 
  Server, 
  Asset, 
  Keypair, 
  TransactionBuilder, 
  Operation, 
  Networks,
  StrKey
} from 'stellar-sdk';
import StellarConfig from '../../stellar.config';

/**
 * Service for interacting with the Stellar network for NFT operations.
 * @class
 */
class StellarService {
  /**
   * Initializes the StellarService with configuration and validates the environment.
   * @constructor
   */
  constructor() {
    console.log(`Initializing StellarService with horizon: ${StellarConfig.HORIZON_URL || 'undefined'}`);
    this.server = new Server(StellarConfig.HORIZON_URL || 'https://horizon-testnet.stellar.org');
    this.networkPassphrase = StellarConfig.NETWORK_PASSPHRASE || (
      StellarConfig.NETWORK === 'PUBLIC' 
        ? Networks.PUBLIC
        : Networks.TESTNET
    );

    console.log(`Network: ${StellarConfig.NETWORK || 'unknown'}, Passphrase: ${this.networkPassphrase.substring(0, 20)}...`);
    
    // Keep track of last known fee stats
    this.lastFeeStats = null;
    this.lastFeeStatsTime = null;
    
    // Verification status
    this.initialized = false;
    this.initializationErrors = [];
    
    // Auto-initialize in constructor
    this.initializeService().catch(error => {
      console.error('[INIT] Service initialization error:', error.message);
      this.initializationErrors.push(`Initialization error: ${error.message}`);
    });
  }

  /**
   * Checks if the service is properly initialized.
   * @returns {boolean} True if initialized, false otherwise.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Gets initialization errors.
   * @returns {string[]} Array of error messages.
   */
  getInitializationErrors() {
    return this.initializationErrors;
  }
  
  /**
   * Initializes the service and validates the environment.
   * @returns {Promise<boolean>} True if initialization succeeds.
   * @throws {Error} If initialization fails.
   */
  async initializeService() {
    console.log('[INIT] Starting Stellar service initialization and validation...');
    this.initializationErrors = [];
    
    try {
      // 1. Validate required environment variables
      await this.validateEnvironmentVariables();
      
      // 2. Verify Stellar network connection
      await this.validateNetworkConnection();
      
      // 3. Validate issuer account
      await this.validateIssuerAccount();
      
      // Mark as initialized if all checks pass
      this.initialized = true;
      console.log('[INIT] ✅ Stellar service initialized successfully');
      return true;
    } catch (error) {
      this.initialized = false;
      console.error('[INIT] ❌ Stellar service initialization failed:', error.message);
      if (!this.initializationErrors.includes(error.message)) {
        this.initializationErrors.push(error.message);
      }
      throw error;
    }
  }
  
  /**
   * Validates required environment variables.
   * @returns {Promise<boolean>} True if valid.
   * @throws {Error} If variables are missing or invalid.
   */
  async validateEnvironmentVariables() {
    console.log('[INIT] Validating environment variables...');
    const requiredVars = {
      REACT_APP_HORIZON_URL: process.env.REACT_APP_HORIZON_URL,
      REACT_APP_STELLAR_NETWORK: process.env.REACT_APP_STELLAR_NETWORK,
      STELLAR_ISSUER_PUBLIC_KEY: process.env.STELLAR_ISSUER_PUBLIC_KEY,
      STELLAR_ISSUER_SECRET_KEY: process.env.STELLAR_ISSUER_SECRET_KEY
    };
    
    const missingVars = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([name]) => name);
    
    if (missingVars.length > 0) {
      const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    // Validate public key format
    if (!this.validatePublicKey(process.env.STELLAR_ISSUER_PUBLIC_KEY)) {
      const errorMsg = 'STELLAR_ISSUER_PUBLIC_KEY has invalid format';
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    // Validate secret key format
    if (!this.validateSecretKey(process.env.STELLAR_ISSUER_SECRET_KEY)) {
      const errorMsg = 'STELLAR_ISSUER_SECRET_KEY has invalid format';
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    // Verify keypair consistency
    try {
      const keypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
      if (keypair.publicKey() !== process.env.STELLAR_ISSUER_PUBLIC_KEY) {
        const errorMsg = 'STELLAR_ISSUER_PUBLIC_KEY does not match the public key derived from STELLAR_ISSUER_SECRET_KEY';
        this.initializationErrors.push(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Error validating keypair: ${error.message}`;
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[INIT] ✅ Environment variables validated successfully');
    return true;
  }
  
  /**
   * Validates the Stellar network connection.
   * @returns {Promise<boolean>} True if connected.
   * @throws {Error} If connection fails.
   */
  async validateNetworkConnection() {
    console.log('[INIT] Verifying Stellar network connection...');
    try {
      const networkInfo = await this.checkNetworkStatus();
      console.log(`[INIT] ✅ Successfully connected to Stellar network (${StellarConfig.NETWORK || 'unknown'})`);
      console.log(`[INIT] Horizon v${networkInfo.horizonVersion}, Core v${networkInfo.stellarCoreVersion}`);
      
      if (networkInfo.networkPassphrase !== this.networkPassphrase) {
        const errorMsg = `Network passphrase mismatch! Expected: ${this.networkPassphrase.substring(0, 20)}..., Got: ${networkInfo.networkPassphrase.substring(0, 20)}...`;
        this.initializationErrors.push(errorMsg);
        throw new Error(errorMsg);
      }
      
      return true;
    } catch (error) {
      const errorMsg = `Failed to connect to Stellar network: ${error.message}`;
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
  }
  
  /**
   * Validates the issuer account.
   * @returns {Promise<boolean>} True if valid.
   * @throws {Error} If account is invalid or unfunded.
   */
  async validateIssuerAccount() {
    if (!process.env.STELLAR_ISSUER_PUBLIC_KEY) {
      const errorMsg = 'Cannot validate issuer account: STELLAR_ISSUER_PUBLIC_KEY is not defined';
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[INIT] Validating issuer account...');
    try {
      const account = await this.getAccount(process.env.STELLAR_ISSUER_PUBLIC_KEY);
      
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      if (!xlmBalance || parseFloat(xlmBalance.balance) < 5) {
        const warningMsg = `Warning: Issuer account has low XLM balance (${xlmBalance ? xlmBalance.balance : '0'} XLM). Recommended minimum is 5 XLM.`;
        console.warn('[INIT] ⚠️', warningMsg);
        this.initializationErrors.push(warningMsg);
      }
      
      console.log(`[INIT] ✅ Issuer account validated: ${process.env.STELLAR_ISSUER_PUBLIC_KEY.substring(0, 5)}...${process.env.STELLAR_ISSUER_PUBLIC_KEY.substring(process.env.STELLAR_ISSUER_PUBLIC_KEY.length - 5)}`);
      return true;
    } catch (error) {
      if (error.response && error.response.status === 404 && StellarConfig.NETWORK === 'TESTNET') {
        console.log('[INIT] Issuer account not found. Attempting to create and fund with Friendbot...');
        try {
          const response = await fetch(`https://friendbot.stellar.org?addr=${process.env.STELLAR_ISSUER_PUBLIC_KEY}`);
          if (!response.ok) {
            const errorResponse = await response.json();
            throw new Error(`Friendbot error: ${errorResponse.detail || 'Unknown error'}`);
          }
          console.log('[INIT] ✅ Successfully created and funded issuer account with Friendbot!');
          return true;
        } catch (friendbotError) {
          const fbErrorMsg = `Failed to create issuer account with Friendbot: ${friendbotError.message}`;
          this.initializationErrors.push(fbErrorMsg);
          throw new Error(fbErrorMsg);
        }
      }
      const errorMsg = `Failed to validate issuer account: ${error.message}`;
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Creates a new Stellar account using Friendbot (testnet only).
   * @returns {Promise<{publicKey: string, secretKey: string, result: object}>} Account details.
   * @throws {Error} If account creation fails.
   */
  async createAccount() {
    try {
      const pair = Keypair.random();
      const response = await fetch(`${StellarConfig.HORIZON_URL}/friendbot?addr=${pair.publicKey()}`);
      const result = await response.json();
      return {
        publicKey: pair.publicKey(),
        secretKey: pair.secret(),
        result
      };
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  }

  /**
   * Checks the Stellar network status.
   * @returns {Promise<object>} Network status details.
   * @throws {Error} If status check fails.
   */
  async checkNetworkStatus() {
    try {
      const serverInfo = await this.server.getRoot();
      const { horizon_version: horizonVersion, core_version: stellarCoreVersion, network_passphrase: networkPassphrase } = serverInfo;
      
      console.log(`Network Status: Horizon v${horizonVersion}, Stellar Core v${stellarCoreVersion}`);
      
      if (networkPassphrase !== this.networkPassphrase) {
        console.warn(`Network passphrase mismatch! Expected: ${this.networkPassphrase}, Got: ${networkPassphrase}`);
      }
      
      return {
        status: 'online',
        horizonVersion,
        stellarCoreVersion,
        networkPassphrase,
        healthy: serverInfo.health === 'healthy'
      };
    } catch (error) {
      console.error('Network status check failed:', error);
      throw new Error(`Failed to connect to Stellar network: ${error.message}`);
    }
  }
  
  /**
   * Gets current network fee statistics.
   * @returns {Promise<object>} Fee statistics.
   */
  async getNetworkFeeStats() {
    const now = Date.now();
    if (this.lastFeeStats && this.lastFeeStatsTime && (now - this.lastFeeStatsTime < 60000)) {
      return this.lastFeeStats;
    }
    
    try {
      const feeStats = await this.server.feeStats();
      this.lastFeeStats = feeStats;
      this.lastFeeStatsTime = now;
      
      const baseFeeStroop = feeStats.fee_charged.p50;
      console.log(`Current network fee (p50): ${baseFeeStroop} stroops (${baseFeeStroop / 10000000} XLM)`);
      
      return feeStats;
    } catch (error) {
      console.error('Failed to get fee stats:', error);
      return {
        fee_charged: {
          min: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          max: parseInt(StellarConfig.TRANSACTION?.FEE || '100') * 2,
          mode: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p10: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p20: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p50: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p80: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p90: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p95: parseInt(StellarConfig.TRANSACTION?.FEE || '100'),
          p99: parseInt(StellarConfig.TRANSACTION?.FEE || '100')
        }
      };
    }
  }
  
  /**
   * Estimates transaction fee based on priority.
   * @param {string} [priority='medium'] - Fee priority ('low', 'medium', 'high', 'very_high').
   * @returns {Promise<string>} Estimated fee in stroops.
   */
  async estimateFee(priority = 'medium') {
    try {
      const feeStats = await this.getNetworkFeeStats();
      let fee;
      
      switch (priority) {
        case 'low':
          fee = feeStats.fee_charged.p20;
          break;
        case 'medium':
          fee = feeStats.fee_charged.p50;
          break;
        case 'high':
          fee = feeStats.fee_charged.p90;
          break;
        case 'very_high':
          fee = feeStats.fee_charged.p99;
          break;
        default:
          fee = feeStats.fee_charged.p50;
      }
      
      const minimumFee = parseInt(StellarConfig.TRANSACTION?.FEE || '100');
      fee = Math.max(fee, minimumFee);
      
      console.log(`Estimated fee (${priority} priority): ${fee} stroops`);
      return fee.toString();
    } catch (error) {
      console.error('Error estimating fee:', error);
      return (StellarConfig.TRANSACTION?.FEE || '100').toString();
    }
  }
  
  /**
   * Validates a Stellar public key.
   * @param {string} publicKey - The public key to validate.
   * @returns {boolean} True if valid.
   */
  validatePublicKey(publicKey) {
    try {
      return StrKey.isValidEd25519PublicKey(publicKey);
    } catch (error) {
      console.error('Invalid public key:', error);
      return false;
    }
  }
  
  /**
   * Validates a Stellar secret key.
   * @param {string} secretKey - The secret key to validate.
   * @returns {boolean} True if valid.
   */
  validateSecretKey(secretKey) {
    try {
      return StrKey.isValidEd25519SecretSeed(secretKey);
    } catch (error) {
      console.error('Invalid secret key:', error);
      return false;
    }
  }
  
  /**
   * Gets account details with retry logic.
   * @param {string} publicKey - The account public key.
   * @returns {Promise<object>} Account details.
   * @throws {Error} If account loading fails.
   */
  async getAccount(publicKey) {
    if (!this.validatePublicKey(publicKey)) {
      console.error(`[ACCOUNT ERROR] Invalid Stellar public key format: ${publicKey}`);
      throw new Error(`Invalid Stellar public key: ${publicKey}`);
    }
    
    const maskedKey = `${publicKey.substring(0, 5)}...${publicKey.substring(publicKey.length - 5)}`;
    console.log(`[ACCOUNT] Loading account: ${maskedKey}`);
    
    const maxRetries = StellarConfig.TRANSACTION?.MAX_RETRIES || 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount <= maxRetries) {
      try {
        const account = await this.server.loadAccount(publicKey);
        console.log(`[ACCOUNT] Account loaded successfully: ${maskedKey}`);
        console.log(`[ACCOUNT] Sequence number: ${account.sequenceNumber()}`);
        console.log(`[ACCOUNT] Number of balances: ${account.balances.length}`);
        account.balances.forEach((balance, index) => {
          if (balance.asset_type === 'native') {
            console.log(`[ACCOUNT] Balance ${index}: ${balance.balance} XLM`);
          } else {
            console.log(`[ACCOUNT] Balance ${index}: ${balance.balance} ${balance.asset_code}:${balance.asset_issuer.substring(0, 5)}...`);
          }
        });
        return account;
      } catch (error) {
        lastError = error;
        console.error(`Error loading account (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
        
        if (error.response && error.response.status === 404) {
          throw error;
        }
        
        if (retryCount === maxRetries) {
          break;
        }
        
        const delay = 1000 * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      }
    }
    
    throw lastError || new Error('Failed to load account after multiple attempts');
  }

  /**
   * Ensures the service is initialized.
   * @returns {Promise<boolean>} True if initialized.
   * @throws {Error} If initialization fails.
   */
  async ensureInitialized() {
    if (!this.initialized) {
      console.warn('[SERVICE] Service not initialized. Attempting initialization...');
      await this.initializeService();
      
      if (!this.initialized) {
        const errors = this.getInitializationErrors();
        throw new Error(`Service not properly initialized. Errors: ${errors.join(', ')}`);
      }
    }
    return true;
  }
  
  /**
   * Creates an NFT as a Stellar asset.
   * @param {string} name - Asset name (1-12 characters).
   * @param {string} description - Asset description.
   * @param {number} totalSupply - Total supply.
   * @returns {Promise<object>} Transaction result.
   * @throws {Error} If creation fails.
   */
  async createNFT(name, description, totalSupply) {
    try {
      console.log(`[NFT] Creating NFT asset: ${name}, supply: ${totalSupply}`);
      await this.ensureInitialized();
      
      // Validate input parameters
      if (!name || name.length > 12 || !/^[a-zA-Z0-9]+$/.test(name)) {
        throw new Error('Asset name must be 1-12 alphanumeric characters');
      }
      
      if (!totalSupply || isNaN(Number(totalSupply)) || Number(totalSupply) <= 0) {
        throw new Error('Total supply must be a positive number');
      }
      
      // Verify network connection before proceeding
      try {
        const networkStatus = await this.checkNetworkStatus();
        console.log(`[NFT] Network connection verified: ${networkStatus.status}, Horizon v${networkStatus.horizonVersion}`);
        
        // Double-check network passphrase
        if (networkStatus.networkPassphrase !== this.networkPassphrase) {
          console.warn(`[NFT] Network passphrase mismatch! Expected: ${this.networkPassphrase.substring(0, 20)}..., Got: ${networkStatus.networkPassphrase.substring(0, 20)}...`);
          // Update to match the actual network
          this.networkPassphrase = networkStatus.networkPassphrase;
          console.log(`[NFT] Updated networkPassphrase to match actual network: ${this.networkPassphrase.substring(0, 20)}...`);
        }
      } catch (networkError) {
        console.warn(`[NFT] Network status check failed: ${networkError.message}. Proceeding with current settings.`);
      }
      
      // Get fee statistics to use optimal fee
      let baseFee;
      try {
        baseFee = await this.estimateFee('high');
        console.log(`[NFT] Using estimated high-priority fee: ${baseFee} stroops`);
      } catch (feeError) {
        console.warn(`[NFT] Fee estimation failed: ${feeError.message}. Using default fee.`);
        baseFee = StellarConfig.TRANSACTION?.FEE || '100';
      }
      
      // Setup issuer keypair and asset
      const issuer = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
      const asset = new Asset(name, issuer.publicKey());
      console.log(`[NFT] Asset code: ${asset.getCode()}, Issuer: ${asset.getIssuer().substring(0, 5)}...`);
      
      // Get fresh account data with retry
      let maxAccountRetries = 3;
      let accountRetryCount = 0;
      let sourceAccount;
      let lastAccountError;
      
      while (accountRetryCount < maxAccountRetries) {
        try {
          sourceAccount = await this.getAccount(issuer.publicKey());
          console.log(`[NFT] Issuer account loaded, sequence number: ${sourceAccount.sequenceNumber()}`);
          break;
        } catch (accountError) {
          lastAccountError = accountError;
          console.error(`[NFT] Error loading account (attempt ${accountRetryCount + 1}/${maxAccountRetries}):`, accountError.message);
          
          if (accountError.response && accountError.response.status === 404) {
            throw new Error('Issuer account does not exist on the network');
          }
          
          accountRetryCount++;
          if (accountRetryCount >= maxAccountRetries) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * accountRetryCount));
        }
      }
      
      if (!sourceAccount) {
        throw lastAccountError || new Error('Failed to load issuer account after multiple attempts');
      }
      
      // Check account has enough XLM for operations
      const xlmBalance = sourceAccount.balances.find(b => b.asset_type === 'native');
      if (!xlmBalance || parseFloat(xlmBalance.balance) < 5) {
        console.warn(`[NFT] Issuer account has low XLM balance: ${xlmBalance ? xlmBalance.balance : '0'} XLM`);
        // Continue, but warn
      }
      
      // Check if asset already exists to avoid duplicate creation
      console.log(`[NFT] Checking if asset ${asset.getCode()} already exists...`);
      const existingAsset = sourceAccount.balances.find(b => 
        b.asset_type !== 'native' && 
        b.asset_code === asset.getCode() && 
        b.asset_issuer === asset.getIssuer()
      );
      
      if (existingAsset) {
        console.warn(`[NFT] Asset ${asset.getCode()} already exists with balance ${existingAsset.balance}`);
        throw new Error(`Asset ${asset.getCode()} already exists. Cannot create duplicate asset with same code.`);
      }
      
      // Calculate optimal transaction fee based on operations
      const operationFee = Math.max(parseInt(baseFee), 100).toString();
      console.log(`[NFT] Using transaction fee: ${operationFee} stroops per operation`);
      
      // ========================
      // STEP 1: CHECK IF TRUSTLINE EXISTS
      // ========================
      console.log(`[NFT-STEP1] Checking if trustline for ${asset.getCode()} already exists`);
      let trustlineExists = false;
      
      // Re-fetch account to ensure we have the latest data
      try {
        const refreshedAccount = await this.getAccount(issuer.publicKey());
        
        // Check for existing trustline
        const existingTrustline = refreshedAccount.balances.find(b => 
          b.asset_type !== 'native' && 
          b.asset_code === asset.getCode() && 
          b.asset_issuer === asset.getIssuer()
        );
        
        if (existingTrustline) {
          console.log(`[NFT-STEP1] Trustline already exists with limit: ${existingTrustline.limit}`);
          trustlineExists = true;
          
          // If trustline exists but with insufficient limit, we need to update it
          if (parseFloat(existingTrustline.limit) < parseFloat(totalSupply)) {
            console.log(`[NFT-STEP1] Existing trustline limit (${existingTrustline.limit}) is less than required (${totalSupply})`);
            trustlineExists = false; // Force trustline update
          }
        } else {
          console.log(`[NFT-STEP1] No existing trustline found for ${asset.getCode()}`);
        }
        
        // Use the refreshed account data
        sourceAccount = refreshedAccount;
      } catch (refreshError) {
        console.warn(`[NFT-STEP1] Error refreshing account data: ${refreshError.message}`);
        // Continue with existing account data
      }
      
      // ========================
      // STEP 2: CREATE TRUSTLINE (IF NEEDED)
      // ========================
      let trustlineResult = null;
      
      if (!trustlineExists) {
        console.log(`[NFT-STEP2] Creating trustline for ${asset.getCode()}`);
        
        try {
          // Create transaction to establish trustline
          const trustlineTx = new TransactionBuilder(sourceAccount, {
            networkPassphrase: this.networkPassphrase,
            fee: operationFee
          })
            .addOperation(Operation.changeTrust({ 
              asset, 
              limit: totalSupply.toString() 
            }))
            .setTimeout(StellarConfig.TRANSACTION?.DEFAULT_TIMEOUT || 180)
            .build();

          // Log the trustline transaction
          console.log(`[NFT-STEP2] Trustline transaction created:`);
          this.logTransactionDetails(trustlineTx);

          // Sign transaction with issuer key
          trustlineTx.sign(issuer);
          console.log(`[NFT-STEP2] Trustline transaction signed with issuer key: ${issuer.publicKey().substring(0, 5)}...`);
          
          // Submit trustline transaction with retry logic
          console.log(`[NFT-STEP2] Submitting trustline transaction...`);
          trustlineResult = await this.submitTransactionWithRetry(
            trustlineTx, 
            StellarConfig.TRANSACTION?.MAX_RETRIES || 3,
            operationFee
          );
          
          console.log(`[NFT-STEP2] ✅ Trustline created successfully! Hash: ${trustlineResult.hash}`);
          
          // Wait for trustline to be established (small delay)
          console.log(`[NFT-STEP2] Waiting for trustline to be established...`);
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Verify the trustline was actually created
          try {
            const verifyAccount = await this.getAccount(issuer.publicKey());
            const verifyTrustline = verifyAccount.balances.find(b => 
              b.asset_type !== 'native' && 
              b.asset_code === asset.getCode() && 
              b.asset_issuer === asset.getIssuer()
            );
            
            if (!verifyTrustline) {
              console.error(`[NFT-STEP2] ❌ Trustline verification failed! Trustline not found after creation.`);
              throw new Error('Trustline creation appeared to succeed but verification failed. Please try again.');
            }
            
            console.log(`[NFT-STEP2] ✅ Trustline verified with limit: ${verifyTrustline.limit}`);
            
            // Use the updated account data with new sequence number
            sourceAccount = verifyAccount;
          } catch (verifyError) {
            console.error(`[NFT-STEP2] ❌ Trustline verification error:`, verifyError);
            throw new Error(`Failed to verify trustline creation: ${verifyError.message}`);
          }
        } catch (trustlineError) {
          console.error(`[NFT-STEP2] ❌ Trustline creation failed:`, trustlineError);
          throw new Error(`Failed to create trustline: ${trustlineError.message}`);
        }
      } else {
        console.log(`[NFT-STEP2] ✓ Trustline already exists, skipping creation`);
      }
      
      // ========================
      // STEP 3: ISSUE NFT TO ISSUER
      // ========================
      console.log(`[NFT-STEP3] Preparing to issue ${totalSupply} units of ${asset.getCode()} to issuer`);
      
      try {
        // Ensure we have the latest account data
        if (trustlineResult) {
          // If we just created a trustline, we need to refresh the account to get the new sequence number
          try {
            sourceAccount = await this.getAccount(issuer.publicKey());
            console.log(`[NFT-STEP3] Account refreshed after trustline creation, new sequence: ${sourceAccount.sequenceNumber()}`);
          } catch (refreshError) {
            console.error(`[NFT-STEP3] Error refreshing account after trustline creation:`, refreshError);
            throw new Error(`Failed to refresh account after trustline creation: ${refreshError.message}`);
          }
        }
        
        // Check if asset already has balance (might happen if this is a retry)
        const existingBalance = sourceAccount.balances.find(b => 
          b.asset_type !== 'native' && 
          b.asset_code === asset.getCode() && 
          b.asset_issuer === asset.getIssuer() && 
          parseFloat(b.balance) > 0
        );
        
        if (existingBalance) {
          console.log(`[NFT-STEP3] Asset ${asset.getCode()} already has balance: ${existingBalance.balance}`);
          if (parseFloat(existingBalance.balance) >= parseFloat(totalSupply)) {
            console.log(`[NFT-STEP3] ✓ Asset already has sufficient balance, skipping issuance`);
            
            // Return success with existing balance
            return {
              result: "success",
              message: `Asset ${asset.getCode()} already issued with balance ${existingBalance.balance}`,
              assetDetails: {
                code: asset.getCode(),
                issuer: asset.getIssuer(),
                total_supply: existingBalance.balance,
                created_at: new Date().toISOString()
              }
            };
          } else {
            console.log(`[NFT-STEP3] Asset has balance ${existingBalance.balance} but needs ${totalSupply}, will issue additional units`);
            // We'll continue to issue the remaining amount
          }
        }
        
        // Create issuance transaction
        console.log(`[NFT-STEP3] Building issuance transaction`);
        const issueTx = new TransactionBuilder(sourceAccount, {
          networkPassphrase: this.networkPassphrase,
          fee: operationFee
        })
          .addOperation(Operation.payment({
            destination: issuer.publicKey(), 
            asset, 
            amount: totalSupply.toString()
          }))
          .setTimeout(StellarConfig.TRANSACTION?.DEFAULT_TIMEOUT || 180)
          .build();
        
        // Add memo if provided
        if (description && typeof description === 'string' && description.trim() !== '') {
          try {
            // Truncate if too long (Stellar has a memo size limit)
            const maxMemoLength = 28;
            const truncatedDesc = description.length > maxMemoLength ? 
              `${description.substring(0, maxMemoLength - 3)}...` : 
              description;
            issueTx.memo = StellarSdk.Memo.text(truncatedDesc);
            console.log(`[NFT-STEP3] Added memo: ${truncatedDesc}`);
          } catch (memoError) {
            console.warn(`[NFT-STEP3] Could not add memo: ${memoError.message}`);
          }
        }
        
        // Log issuance transaction
        console.log(`[NFT-STEP3] Issuance transaction created`);
        this.logTransactionDetails(issueTx);
        
        // Sign with issuer key
        issueTx.sign(issuer);
        console.log(`[NFT-STEP3] Issuance transaction signed`);
        
        // Submit with retry logic
        console.log(`[NFT-STEP3] Submitting issuance transaction...`);
        const issueResult = await this.submitTransactionWithRetry(
          issueTx,
          StellarConfig.TRANSACTION?.MAX_RETRIES || 3,
          operationFee
        );
        
        console.log(`[NFT-STEP3] 🎉 NFT issuance successful! Hash: ${issueResult.hash}`);
        
        // ========================
        // STEP 4: FINAL VERIFICATION
        // ========================
        console.log(`[NFT-STEP4] Performing final verification of NFT creation`);
        
        try {
          // Wait a moment for the ledger to reflect the changes
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Check final account state
          const finalAccount = await this.getAccount(issuer.publicKey());
          const finalBalance = finalAccount.balances.find(b => 
            b.asset_type !== 'native' && 
            b.asset_code === asset.getCode() && 
            b.asset_issuer === asset.getIssuer()
          );
          
          if (!finalBalance) {
            console.warn(`[NFT-STEP4] ⚠️ Final verification could not find the asset balance`);
          } else {
            console.log(`[NFT-STEP4] ✅ NFT created and issued successfully with balance: ${finalBalance.balance}`);
            if (parseFloat(finalBalance.balance) < parseFloat(totalSupply)) {
              console.warn(`[NFT-STEP4] ⚠️ Final balance (${finalBalance.balance}) is less than requested (${totalSupply})`);
            }
          }
        } catch (finalError) {
          console.warn(`[NFT-STEP4] Final verification error:`, finalError);
          // Continue anyway since the issuance was successful
        }
        
        // Return combined results
        let finalResult = {
          hash: issueResult.hash,
          ledger: issueResult.ledger,
          assetDetails: {
            code: asset.getCode(),
            issuer: asset.getIssuer(),
            total_supply: totalSupply.toString(),
            created_at: new Date().toISOString()
          }
        };
        
        if (trustlineResult) {
          finalResult.trustlineHash = trustlineResult.hash;
        }
        
        return finalResult;
      } catch (issueError) {
        console.error(`[NFT-STEP3] ❌ NFT issuance failed:`, issueError);
        
        // Provide more specific error messages
        if (issueError.message.includes('op_no_trust')) {
          throw new Error('Failed to issue NFT: No trustline exists. This may be a timing issue, please try again.');
        } else if (issueError.message.includes('op_line_full')) {
          throw new Error('Failed to issue NFT: Trustline is full. Please create with a smaller total supply.');
        } else if (issueError.message.includes('op_underfunded')) {
          throw new Error('Failed to issue NFT: Account is underfunded. Please ensure your account has sufficient XLM.');
        } else if (issueError.message.includes('tx_bad_seq')) {
          throw new Error('Failed to issue NFT: Bad sequence number. Please try again.');
        } else if (issueError.message.includes('400 Bad Request')) {
          throw new Error('Failed to issue NFT: The transaction was rejected by the network. This may be due to a network issue or invalid transaction parameters.');
        } else {
          throw issueError;
        }
      }
    } catch (error) {
      console.error('[NFT] Error creating NFT:', error);
      
      // Enhance error message for common issues
      if (error.message.includes('op_malformed')) {
        throw new Error(`Failed to create NFT: Malformed operation. Please check asset code and amounts.`);
      } else if (error.message.includes('op_low_reserve')) {
        throw new Error(`Failed to create NFT: Account has insufficient XLM to meet reserve requirements.`);
      } else if (error.message.includes('Bad Request') || error.message.includes('400')) {
        throw new Error(`Failed to create NFT: Bad Request. This may be due to invalid parameters or a network issue. Please try again.`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Validates transaction operations.
   * @param {object[]} operations - Transaction operations.
   * @returns {{valid: boolean, error?: string}} Validation result.
   */
  validateOperations(operations) {
    if (!operations || operations.length === 0) {
      return { valid: false, error: 'No operations provided' };
    }
    
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      
      if (!op.type) {
        return { valid: false, error: `Operation at index ${i} has no type` };
      }
      
      switch (op.type) {
        case 'payment':
          if (!op.destination) return { valid: false, error: `Payment operation at index ${i} has no destination` };
          if (!op.asset) return { valid: false, error: `Payment operation at index ${i} has no asset` };
          if (!op.amount) return { valid: false, error: `Payment operation at index ${i} has no amount` };
          break;
          
        case 'changeTrust':
          if (!op.asset) return { valid: false, error: `ChangeTrust operation at index ${i} has no asset` };
          break;
          
        case 'omorphisms':
          if (!op.name) return { valid: false, error: `ManageData operation at index ${i} has no name` };
          break;
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Logs transaction details.
   * @param {object} transaction - The transaction to log.
   */
  logTransactionDetails(transaction) {
    try {
      console.log('--------- Transaction Details ---------');
      const maskedSource = `${transaction.source.substring(0, 5)}...${transaction.source.substring(transaction.source.length - 5)}`;
      console.log(`[TX] Source account: ${maskedSource}`);
      console.log(`[TX] Sequence number: ${transaction.sequence}`);
      console.log(`[TX] Fee: ${transaction.fee} stroops (${parseInt(transaction.fee) / 10000000} XLM)`);
      console.log(`[TX] Operation count: ${transaction.operations.length}`);
      if (transaction.timeBounds) {
        const now = Math.floor(Date.now() / 1000);
        const minTime = parseInt(transaction.timeBounds.minTime);
        const maxTime = parseInt(transaction.timeBounds.maxTime);
        console.log(`[TX] Time bounds: minTime=${minTime}, maxTime=${maxTime} (expires in ${maxTime - now} seconds)`);
      } else {
        console.log(`[TX] No time bounds set (transaction never expires)`);
      }
      
      console.log('Operations:');
      transaction.operations.forEach((op, i) => {
        console.log(`[TX-OP ${i}] Type: ${op.type}`);
        
        switch (op.type) {
          case 'payment':
            const destMasked = `${op.destination.substring(0, 5)}...${op.destination.substring(op.destination.length - 5)}`;
            console.log(`[TX-OP ${i}] Destination: ${destMasked}`);
            const assetInfo = op.asset.isNative() 
              ? 'XLM (native)' 
              : `${op.asset.getCode()}:${op.asset.getIssuer().substring(0, 5)}...`;
            console.log(`[TX-OP ${i}] Asset: ${assetInfo}`);
            console.log(`[TX-OP ${i}] Amount: ${op.amount}`);
            break;
            
          case 'changeTrust':
            const trustAssetInfo = op.asset.isNative() 
              ? 'XLM (native)' 
              : `${op.asset.getCode()}:${op.asset.getIssuer().substring(0, 5)}...`;
            console.log(`[TX-OP ${i}] Asset: ${trustAssetInfo}`);
            console.log(`[TX-OP ${i}] Limit: ${op.limit}`);
            break;
            
          case 'manageData':
            console.log(`[TX-OP ${i}] Name: ${op.name}`);
            if (op.value) {
              try {
                const decodedValue = Buffer.from(op.value).toString('utf-8');
                console.log(`[TX-OP ${i}] Value: ${decodedValue.length > 30 ? `${decodedValue.substring(0, 30)}...` : decodedValue} (${op.value.length} bytes)`);
              } catch {
                console.log(`[TX-OP ${i}] Value: [Binary data] (${op.value.length} bytes)`);
              }
            } else {
              console.log(`[TX-OP ${i}] Value: [Deleted]`);
            }
            break;
            
          default:
            console.log(`[TX-OP ${i}] [Details omitted for ${op.type}]`);
        }
      });
      
      const txXDR = transaction.toEnvelope().toXDR('base64');
      console.log(`[TX] Transaction XDR: ${txXDR.substring(0, 30)}...${txXDR.substring(txXDR.length - 30)}`);
    } catch (error) {
      console.error('[ERROR] Error logging transaction details:', error);
    }
  }
  
  /**
   * Logs account state.
   * @param {string} publicKey - Account public key.
   * @param {string} [operationType] - Operation type for context.
   * @returns {Promise<object|null>} Account details or null if failed.
   */
  async logAccountState(publicKey, operationType = null) {
    try {
      console.log(`[DEBUG] Checking account state for ${publicKey.substring(0, 5)}... (${operationType || 'general'})`);
      const account = await this.server.loadAccount(publicKey);
      
      console.log(`[DEBUG] Account ${publicKey.substring(0, 5)}... sequence: ${account.sequenceNumber()}`);
      
      account.balances.forEach(balance => {
        if (balance.asset_type === 'native') {
          console.log(`[DEBUG] Account balance: ${balance.balance} XLM`);
        } else {
          console.log(`[DEBUG] Account balance: ${balance.balance} ${balance.asset_code}:${balance.asset_issuer.substring(0, 5)}...`);
        }
      });
      
      if (operationType === 'payment' || operationType === 'changeTrust') {
        console.log(`[DEBUG] Account has ${account.balances.length - 1} trustlines`);
      }
      
      return account;
    } catch (error) {
      console.error(`[ERROR] Failed to check account state: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Submits a transaction with retry logic and fee bumping.
   * @param {object} transaction - The transaction to submit.
   * @param {number} [maxRetries] - Maximum retry attempts.
   * @param {string} [initialFee] - Initial fee in stroops.
   * @returns {Promise<object>} Transaction result.
   * @throws {Error} If submission fails.
   */
  async submitTransactionWithRetry(transaction, maxRetries = null, initialFee = null) {
    if (!transaction) {
      throw new Error('No transaction provided to submitTransactionWithRetry');
    }
    
    maxRetries = maxRetries || StellarConfig.TRANSACTION?.MAX_RETRIES || 3;
    let retryCount = 0;
    let currentFee = initialFee || (StellarConfig.TRANSACTION?.FEE || '100');
    let lastError = null;
    
    try {
      await this.checkNetworkStatus();
    } catch (error) {
      console.warn('Network status check failed, proceeding with submission anyway:', error.message);
    }
    
    const validationResult = this.validateOperations(transaction.operations);
    if (!validationResult.valid) {
      console.error('Transaction validation failed:', validationResult.error);
      throw new Error(`Invalid transaction: ${validationResult.error}`);
    }
    
    try {
      const sourceAccountId = transaction.source;
      const currentAccount = await this.getAccount(sourceAccountId);
      const currentSequence = currentAccount.sequenceNumber();
      const txSequence = transaction.sequence;
      
      if (BigInt(txSequence) < BigInt(currentSequence)) {
        console.error(`Transaction sequence number (${txSequence}) is less than current account sequence (${currentSequence})`);
        throw new Error('Transaction has an outdated sequence number and cannot be submitted');
      }
    } catch (seqError) {
      console.warn('Sequence number validation failed, continuing anyway:', seqError.message);
    }
    
    this.logTransactionDetails(transaction);
    
    try {
      const estimatedFee = await this.estimateFee('medium');
      const txFee = parseInt(transaction.fee);
      if (txFee < parseInt(estimatedFee)) {
        console.warn(`Transaction fee (${txFee}) is below the estimated fee (${estimatedFee}). This may cause the transaction to fail.`);
      }
    } catch (feeError) {
      console.warn('Fee estimation failed, continuing with provided fee:', feeError.message);
    }
    
    while (retryCount <= maxRetries) {
      try {
        console.log(`[TX-SUBMIT] Submitting transaction (attempt ${retryCount + 1}/${maxRetries + 1})...`);
        
        try {
          const networkStatus = await this.checkNetworkStatus();
          console.log(`[TX-SUBMIT] Network status: ${networkStatus.status}, Horizon v${networkStatus.horizonVersion}`);
        } catch (networkError) {
          console.warn(`[TX-SUBMIT] Failed to check network status before submission: ${networkError.message}`);
        }
        
        try {
          await this.logAccountState(transaction.source, 'pre-submission');
        } catch (accountError) {
          console.warn(`[TX-SUBMIT] Failed to log account state: ${accountError.message}`);
        }
        
        console.time('[TX-SUBMIT] Transaction submission time');
        const response = await this.server.submitTransaction(transaction);
        console.timeEnd('[TX-SUBMIT] Transaction submission time');
        
        console.log(`[TX-SUCCESS] Transaction submitted successfully! Hash: ${response.hash}`);
        console.log(`[TX-SUCCESS] Ledger: ${response.ledger}, Result: ${JSON.stringify(response.result)}`);
        return response;
      } catch (txError) {
        lastError = txError;
        console.error(`[TX-ERROR] Transaction submission error (attempt ${retryCount + 1}/${maxRetries + 1}):`, txError.message);
        
        if (txError.response) {
          console.error(`[TX-ERROR] Status: ${txError.response.status}`);
          console.error(`[TX-ERROR] Status Text: ${txError.response.statusText}`);
          
          if (txError.response.headers) {
            console.error(`[TX-ERROR] Response Headers: ${JSON.stringify(txError.response.headers)}`);
          }
          
          if (txError.response.data) {
            console.error(`[TX-ERROR] Response Data: ${JSON.stringify(txError.response.data)}`);
          }
        }
        
        const resultCodes = txError.response?.data?.extras?.result_codes;
        
        if (resultCodes) {
          console.error('Transaction result codes:', resultCodes);
          
          if (resultCodes.transaction === 'tx_insufficient_fee' && retryCount < maxRetries) {
            const newFee = parseInt(currentFee) * 2;
            console.log(`Increasing fee from ${currentFee} to ${newFee} stroops and retrying...`);
            currentFee = newFee.toString();
            
            try {
              const feeSource = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
              const bumpedTx = TransactionBuilder.buildFeeBumpTransaction(
                feeSource, 
                currentFee,
                transaction,
                this.networkPassphrase
              );
              bumpedTx.sign(feeSource);
              transaction = bumpedTx;
            } catch (bumpError) {
              console.error('Error creating fee bump transaction:', bumpError);
            }
            
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          }
          
          if (resultCodes.transaction === 'tx_bad_seq' && retryCount < maxRetries) {
            console.log('Sequence number error, refreshing account and retrying...');
            try {
              const sourceAccountId = transaction.source;
              const updatedAccount = await this.getAccount(sourceAccountId);
              
              const rebuiltTx = new TransactionBuilder(updatedAccount, {
                fee: currentFee,
                networkPassphrase: this.networkPassphrase
              });
              
              for (const op of transaction.operations) {
                rebuiltTx.addOperation(op);
              }
              
              rebuiltTx.setTimeout(transaction.timeout || 180);
              const newTx = rebuiltTx.build();
              const sourceKeypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
              newTx.sign(sourceKeypair);
              
              transaction = newTx;
            } catch (rebuildError) {
              console.error('Error rebuilding transaction:', rebuildError);
            }
            
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          }
          
          if (resultCodes.operations && resultCodes.operations.length > 0) {
            const opErrors = resultCodes.operations.map((code, index) => {
              switch (code) {
                case 'op_underfunded': return `Operation ${index}: Insufficient funds`;
                case 'op_no_trust': return `Operation ${index}: No trustline exists`;
                case 'op_no_issuer': return `Operation ${index}: Asset issuer does not exist`;
                case 'op_no_destination': return `Operation ${index}: Destination account does not exist`;
                case 'op_line_full': return `Operation ${index}: Trustline is full`;
                case 'op_low_reserve': return `Operation ${index}: Source or destination account balance would fall below minimum reserve`;
                case 'op_malformed': return `Operation ${index}: Operation is malformed`;
                default: return code;
              }
            });
            
            throw new Error(`Transaction operation errors: ${opErrors.join(', ')}`);
          }
          
          if (resultCodes.transaction) {
            throw new Error(`Transaction error: ${resultCodes.transaction}`);
          }
        }
        
        if (txError.response && txError.response.status === 429) {
          const retryAfter = parseInt(txError.response.headers?.['retry-after'] || '5');
          console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          retryCount++;
          continue;
        }
        
        if (!txError.response || txError.message.includes('Network Error')) {
          if (retryCount < maxRetries) {
            const delay = 1000 * Math.pow(2, retryCount);
            console.log(`Network error. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retryCount++;
            continue;
          }
        }
        
        if (retryCount >= maxRetries) {
          const errorInfo = txError.response?.data || {};
          const errorMessage = errorInfo.title || txError.message || 'Unknown transaction error';
          const errorStatus = txError.response?.status || 'No status';
          
          throw new Error(`Transaction failed after ${maxRetries + 1} attempts: ${errorStatus} - ${errorMessage}`);
        }
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    throw lastError || new Error('Transaction failed after multiple attempts');
  }

  /**
   * Transfers an NFT to another account.
   * @param {string} fromSecret - Source account secret key.
   * @param {string} toPublicKey - Destination public key.
   * @param {string} assetCode - Asset code.
   * @param {string} amount - Amount to transfer.
   * @returns {Promise<object>} Transaction result.
   * @throws {Error} If transfer fails.
   */
  async transferNFT(fromSecret, toPublicKey, assetCode, amount) {
    try {
      await this.ensureInitialized();
      
      if (!fromSecret || typeof fromSecret !== 'string') {
        throw new Error('Invalid source secret key');
      }
      
      if (!toPublicKey || typeof toPublicKey !== 'string') {
        throw new Error('Invalid destination public key');
      }
      
      if (!assetCode || typeof assetCode !== 'string' || assetCode.length > 12) {
        throw new Error('Invalid asset code. Must be a string with 1-12 characters');
      }
      
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new Error('Invalid amount. Must be a positive number');
      }
      
      const source = Keypair.fromSecret(fromSecret);
      const asset = new Asset(assetCode, StellarConfig.ASSET?.ISSUER);
      
      const sourceAccount = await this.getAccount(source.publicKey());
      
      const assetBalance = sourceAccount.balances.find(b => 
        b.asset_type !== 'native' && 
        b.asset_code === asset.getCode() && 
        b.asset_issuer === asset.getIssuer()
      );
      
      if (!assetBalance || parseFloat(assetBalance.balance) < parseFloat(amount)) {
        throw new Error(`Insufficient balance: ${assetBalance ? assetBalance.balance : '0'} ${assetCode}`);
      }
      
      try {
        await this.getAccount(toPublicKey);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new Error('Destination account does not exist on the Stellar network');
        }
      }
      
      const transaction = new TransactionBuilder(sourceAccount, {
        networkPassphrase: this.networkPassphrase,
        fee: StellarConfig.TRANSACTION?.FEE || '100'
      })
        .addOperation(Operation.payment({ destination: toPublicKey, asset, amount: amount.toString() }))
        .setTimeout(StellarConfig.TRANSACTION?.DEFAULT_TIMEOUT || 180)
        .build();
      
      transaction.sign(source);
      
      return await this.submitTransactionWithRetry(transaction);
    } catch (error) {
      console.error('Error transferring NFT:', error);
      throw error;
    }
  }
  
  /**
   * Gets the NFT balance for an account.
   * @param {string} publicKey - Account public key.
   * @param {string} assetCode - Asset code.
   * @returns {Promise<string>} Balance amount.
   * @throws {Error} If balance retrieval fails.
   */
  async getNFTBalance(publicKey, assetCode) {
    try {
      await this.ensureInitialized();
      
      const account = await this.getAccount(publicKey);
      const asset = new Asset(assetCode, StellarConfig.ASSET?.ISSUER);
      const balance = account.balances.find(b => 
        b.asset_type !== 'native' && 
        b.asset_code === asset.getCode() && 
        b.asset_issuer === asset.getIssuer()
      );
      return balance ? balance.balance : '0';
    } catch (error) {
      console.error('Error getting NFT balance:', error);
      throw error;
    }
  }
  
  /**
   * Gets transaction history for an account.
   * @param {string} publicKey - Account public key.
   * @returns {Promise<object>} Transaction history.
   * @throws {Error} If history retrieval fails.
   */
  async getTransactionHistory(publicKey) {
    try {
      await this.ensureInitialized();
      return await this.server.transactions().forAccount(publicKey).call();
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }
}

// Export singleton instance
// Note: Consider using a factory if multiple instances are needed
export default new StellarService();