import { 
  Server, 
  Asset, 
  Keypair, 
  TransactionBuilder, 
  Operation, 
  Networks,
  StrKey,
  BASE_FEE
} from 'stellar-sdk';
import StellarConfig from '../../stellar.config';

class StellarService {
  constructor() {
    console.log(`Initializing StellarService with horizon: ${StellarConfig.HORIZON_URL}`);
    this.server = new Server(StellarConfig.HORIZON_URL);
    this.networkPassphrase = StellarConfig.NETWORK_PASSPHRASE || (
      StellarConfig.NETWORK === 'PUBLIC' 
        ? Networks.PUBLIC
        : Networks.TESTNET
    );
    
    console.log(`Network: ${StellarConfig.NETWORK}, Passphrase: ${this.networkPassphrase.substring(0, 20)}...`);
    this.lastFeeStats = null;
    this.lastFeeStatsTime = null;
    this.initialized = false;
    this.initializationErrors = [];
    
    this.initializeService().catch(error => {
      console.error('[INIT] Service initialization error:', error.message);
      this.initializationErrors.push(`Initialization error: ${error.message}`);
    });
  }

  isInitialized() {
    return this.initialized;
  }

  getInitializationErrors() {
    return this.initializationErrors;
  }
  
  async initializeService() {
    console.log('[INIT] Starting Stellar service initialization and validation...');
    this.initializationErrors = [];
    
    try {
      await this.validateEnvironmentVariables();
      await this.validateNetworkConnection();
      await this.validateIssuerAccount();
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
  
  async validateEnvironmentVariables() {
    console.log('[INIT] Validating environment variables...');
    const requiredVars = {
      'REACT_APP_HORIZON_URL': process.env.REACT_APP_HORIZON_URL,
      'REACT_APP_STELLAR_NETWORK': process.env.REACT_APP_STELLAR_NETWORK,
      'STELLAR_ISSUER_PUBLIC_KEY': process.env.STELLAR_ISSUER_PUBLIC_KEY,
      'STELLAR_ISSUER_SECRET_KEY': process.env.STELLAR_ISSUER_SECRET_KEY
    };
    
    const missingVars = [];
    
    for (const [name, value] of Object.entries(requiredVars)) {
      if (!value) {
        missingVars.push(name);
      }
    }
    
    if (missingVars.length > 0) {
      const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    if (process.env.STELLAR_ISSUER_PUBLIC_KEY && !this.validatePublicKey(process.env.STELLAR_ISSUER_PUBLIC_KEY)) {
      const errorMsg = 'STELLAR_ISSUER_PUBLIC_KEY has invalid format';
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    if (process.env.STELLAR_ISSUER_SECRET_KEY && !this.validateSecretKey(process.env.STELLAR_ISSUER_SECRET_KEY)) {
      const errorMsg = 'STELLAR_ISSUER_SECRET_KEY has invalid format';
      this.initializationErrors.push(errorMsg);
      throw new Error(errorMsg);
    }
    
    if (process.env.STELLAR_ISSUER_PUBLIC_KEY && process.env.STELLAR_ISSUER_SECRET_KEY) {
      try {
        const keypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
        if (keypair.publicKey() !== process.env.STELLAR_ISSUER_PUBLIC_KEY) {
          const errorMsg = 'STELLAR_ISSUER_PUBLIC_KEY does not match the public key derived from STELLAR_ISSUER_SECRET_KEY';
          this.initializationErrors.push(errorMsg);
          throw new Error(errorMsg);
        }
      } catch (error) {
        if (!error.message.includes('does not match')) {
          const errorMsg = `Error validating keypair: ${error.message}`;
          this.initializationErrors.push(errorMsg);
          throw new Error(errorMsg);
        } else {
          throw error;
        }
      }
    }
    
    console.log('[INIT] ✅ Environment variables validated successfully');
    return true;
  }
  
  async validateNetworkConnection() {
    console.log('[INIT] Verifying Stellar network connection...');
    try {
      const networkInfo = await this.checkNetworkStatus();
      console.log(`[INIT] ✅ Successfully connected to Stellar network (${StellarConfig.NETWORK})`);
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
      if (error.response && error.response.status === 404) {
        const errorMsg = 'Issuer account does not exist on the Stellar network. It needs to be created and funded first.';
        
        if (StellarConfig.NETWORK === 'TESTNET') {
          console.log('[INIT] Issuer account not found. Attempting to create and fund with Friendbot...');
          try {
            const response = await fetch(`https://friendbot.stellar.org?addr=${process.env.STELLAR_ISSUER_PUBLIC_KEY}`);
            if (response.ok) {
              console.log('[INIT] ✅ Successfully created and funded issuer account with Friendbot!');
              return true;
            } else {
              const errorResponse = await response.json();
              throw new Error(`Friendbot error: ${errorResponse.detail || 'Unknown error'}`);
            }
          } catch (friendbotError) {
            const fbErrorMsg = `Failed to create issuer account with Friendbot: ${friendbotError.message}`;
            this.initializationErrors.push(fbErrorMsg);
            throw new Error(fbErrorMsg);
          }
        } else {
          this.initializationErrors.push(errorMsg);
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `Failed to validate issuer account: ${error.message}`;
        this.initializationErrors.push(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }

  async createAccount() {
    try {
      const pair = Keypair.random();
      const response = await fetch(
        `${StellarConfig.HORIZON_URL}/friendbot?addr=${pair.publicKey()}`
      );
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

  async checkNetworkStatus() {
    try {
      const serverInfo = await this.server.getRoot();
      const horizonVersion = serverInfo.horizon_version;
      const stellarCoreVersion = serverInfo.core_version;
      const networkPassphrase = serverInfo.network_passphrase;
      
      console.log(`Network Status: Horizon v${horizonVersion}, Stellar Core v${stellarCoreVersion}`);
      
      if (networkPassphrase !== this.networkPassphrase) {
        console.warn(`Network passphrase mismatch! Expected: ${this.networkPassphrase}, Got: ${networkPassphrase}`);
      }
      
      return {
        status: 'online',
        horizonVersion,
        stellarCoreVersion,
        networkPassphrase,
        healthy: serverInfo.health === 'healthy' || true
      };
    } catch (error) {
      console.error('Network status check failed:', error);
      throw new Error(`Failed to connect to Stellar network: ${error.message}`);
    }
  }
  
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
          min: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          max: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE) * 2,
          mode: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p10: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p20: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p50: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p80: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p90: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p95: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE),
          p99: parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE)
        }
      };
    }
  }
  
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
      
      const minimumFee = parseInt(StellarConfig.TRANSACTION.FEE || BASE_FEE);
      fee = Math.max(fee, minimumFee);
      
      console.log(`Estimated fee (${priority} priority): ${fee} stroops`);
      return fee.toString();
    } catch (error) {
      console.error('Error estimating fee:', error);
      return (StellarConfig.TRANSACTION.FEE || BASE_FEE).toString();
    }
  }
  
  validatePublicKey(publicKey) {
    try {
      return StrKey.isValidEd25519PublicKey(publicKey);
    } catch (error) {
      console.error('Invalid public key:', error);
      return false;
    }
  }
  
  validateSecretKey(secretKey) {
    try {
      return StrKey.isValidEd25519SecretSeed(secretKey);
    } catch (error) {
      console.error('Invalid secret key:', error);
      return false;
    }
  }
  
  async getAccount(publicKey) {
    if (!this.validatePublicKey(publicKey)) {
      console.error(`[ACCOUNT ERROR] Invalid Stellar public key format: ${publicKey}`);
      throw new Error(`Invalid Stellar public key: ${publicKey}`);
    }
    
    const maskedKey = `${publicKey.substring(0, 5)}...${publicKey.substring(publicKey.length - 5)}`;
    console.log(`[ACCOUNT] Loading account: ${maskedKey}`);
    
    const maxRetries = StellarConfig.TRANSACTION.MAX_RETRIES || 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount <= maxRetries) {
      try {
        const account = await this.server.loadAccount(publicKey);
        console.log(`[ACCOUNT] Account loaded successfully: ${publicKey.substring(0, 5)}...${publicKey.substring(publicKey.length - 5)}`);
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
  
  async createNFT(userSecret, name, description, totalSupply) {
    try {
      await this.ensureInitialized();
      
      // Input validation
      if (!userSecret || typeof userSecret !== 'string') {
        throw new Error('Invalid user secret key');
      }
      if (!this.validateSecretKey(userSecret)) {
        throw new Error('Invalid user secret key format');
      }
      if (!name || name.length > 12 || !/^[a-zA-Z0-9]+$/.test(name)) {
        throw new Error('Asset name must be 1-12 alphanumeric characters');
      }
      if (!totalSupply || isNaN(Number(totalSupply)) || Number(totalSupply) <= 0) {
        throw new Error('Total supply must be a positive number');
      }
      
      // Create keypair for user and issuer
      const userKeypair = Keypair.fromSecret(userSecret);
      const issuerPublicKey = process.env.STELLAR_ISSUER_PUBLIC_KEY;
      
      // Create the asset with the configured issuer
      const asset = new Asset(name, issuerPublicKey);
      
      // Load user account
      const userAccount = await this.getAccount(userKeypair.publicKey());
      
      // Check if user has a trustline for the asset
      const hasTrustline = userAccount.balances.some(b => 
        b.asset_type !== 'native' && 
        b.asset_code === asset.getCode() && 
        b.asset_issuer === asset.getIssuer()
      );
      
      // Build transaction
      const transactionBuilder = new TransactionBuilder(userAccount, {
        networkPassphrase: this.networkPassphrase,
        fee: await this.estimateFee('medium') // Use dynamic fee estimation
      });
      
      // Add trustline operation if needed
      if (!hasTrustline) {
        transactionBuilder.addOperation(Operation.changeTrust({
          asset: asset,
          limit: totalSupply.toString()
        }));
      }
      
      // Add payment operation to mint tokens from issuer to user
      transactionBuilder.addOperation(Operation.payment({
        destination: userKeypair.publicKey(),
        asset: asset,
        amount: totalSupply.toString(),
        source: issuerPublicKey // Issuer is the source of the payment
      }));
      
      const transaction = transactionBuilder
        .setTimeout(StellarConfig.TRANSACTION.DEFAULT_TIMEOUT || 180)
        .build();
      
      // Sign with both user (for trustline and transaction) and issuer (for payment)
      transaction.sign(userKeypair);
      const issuerKeypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET_KEY);
      transaction.sign(issuerKeypair);
      
      // Submit transaction with retry logic
      return await this.submitTransactionWithRetry(transaction);
    } catch (error) {
      console.error('Error creating NFT:', error);
      throw error;
    }
  }

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
          if (!op.destination) {
            return { valid: false, error: `Payment operation at index ${i} has no destination` };
          }
          if (!op.asset) {
            return { valid: false, error: `Payment operation at index ${i} has no asset` };
          }
          if (!op.amount) {
            return { valid: false, error: `Payment operation at index ${i} has no amount` };
          }
          break;
          
        case 'changeTrust':
          if (!op.asset) {
            return { valid: false, error: `ChangeTrust operation at index ${i} has no asset` };
          }
          break;
          
        case 'manageData':
          if (!op.name) {
            return { valid: false, error: `ManageData operation at index ${i} has no name` };
          }
          break;
      }
    }
    
    return { valid: true };
  }
  
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
        const timeUntilExpiry = maxTime - now;
        console.log(`[TX] Time bounds: minTime=${minTime}, maxTime=${maxTime} (expires in ${timeUntilExpiry} seconds)`);
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
            
            let assetInfo;
            if (op.asset.isNative()) {
              assetInfo = 'XLM (native)';
            } else {
              const issuerMasked = `${op.asset.getIssuer().substring(0, 5)}...${op.asset.getIssuer().substring(op.asset.getIssuer().length - 5)}`;
              assetInfo = `${op.asset.getCode()}:${issuerMasked}`;
            }
            console.log(`[TX-OP ${i}] Asset: ${assetInfo}`);
            console.log(`[TX-OP ${i}] Amount: ${op.amount}`);
            if (op.source) {
              const sourceMasked = `${op.source.substring(0, 5)}...${op.source.substring(op.source.length - 5)}`;
              console.log(`[TX-OP ${i}] Source: ${sourceMasked}`);
            }
            break;
            
          case 'changeTrust':
            let trustAssetInfo;
            if (op.asset.isNative()) {
              trustAssetInfo = 'XLM (native)';
            } else {
              const issuerMasked = `${op.asset.getIssuer().substring(0, 5)}...${op.asset.getIssuer().substring(op.asset.getIssuer().length - 5)}`;
              trustAssetInfo = `${op.asset.getCode()}:${issuerMasked}`;
            }
            console.log(`[TX-OP ${i}] Asset: ${trustAssetInfo}`);
            console.log(`[TX-OP ${i}] Limit: ${op.limit}`);
            break;
            
          case 'manageData':
            console.log(`[TX-OP ${i}] Name: ${op.name}`);
            if (op.value) {
              try {
                const decodedValue = Buffer.from(op.value).toString('utf-8');
                if (decodedValue.length > 30) {
                  console.log(`[TX-OP ${i}] Value: ${decodedValue.substring(0, 30)}... (${op.value.length} bytes)`);
                } else {
                  console.log(`[TX-OP ${i}] Value: ${decodedValue} (${op.value.length} bytes)`);
                }
              } catch (e) {
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
      
      try {
        const txXDR = transaction.toEnvelope().toXDR('base64');
        console.log(`[TX] Transaction XDR: ${txXDR.substring(0, 30)}...${txXDR.substring(txXDR.length - 30)}`);
      } catch (xdrError) {
        console.error('[TX] Failed to generate XDR:', xdrError);
      }
      
      console.log('---------------------------------------');
    } catch (error) {
      console.error('[ERROR] Error logging transaction details:', error);
    }
  }
  
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
  
  async submitTransactionWithRetry(transaction, maxRetries = null, initialFee = null) {
    if (!transaction) {
      throw new Error('No transaction provided to submitTransactionWithRetry');
    }
    
    maxRetries = maxRetries || StellarConfig.TRANSACTION.MAX_RETRIES || 3;
    let retryCount = 0;
    let currentFee = initialFee || (StellarConfig.TRANSACTION.FEE || '100');
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
      if (seqError.message.includes('outdated sequence')) {
        throw seqError;
      }
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
        console.error(`[TX-ERROR] Transaction submission error (attempt ${retryCount + 1}/${maxRetries + 1}):`);
        
        if (txError.response) {
          console.error(`[TX-ERROR] Status: ${txError.response.status}`);
          console.error(`[TX-ERROR] Status Text: ${txError.response.statusText}`);
          
          const headers = txError.response.headers;
          if (headers) {
            console.error(`[TX-ERROR] Response Headers: ${JSON.stringify(headers)}`);
          }
          
          if (txError.response.data) {
            let errorDetails = {
              status: txError.response?.status,
              message: txError.message,
              resultCodes: txError.response?.data?.extras?.result_codes
            };
            
            const resultCodes = errorDetails.resultCodes;
            
            if (resultCodes) {
              console.error('Transaction result codes:', resultCodes);
              
              if (resultCodes.transaction === 'tx_insufficient_fee') {
                if (retryCount < maxRetries) {
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
              }
              
              else if (resultCodes.transaction === 'tx_bad_seq') {
                if (retryCount < maxRetries) {
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
              }
              
              else if (resultCodes.operations && resultCodes.operations.length > 0) {
                const opErrors = resultCodes.operations.map((code, index) => {
                  let errorMessage = code;
                  
                  switch (code) {
                    case 'op_underfunded':
                      errorMessage = `Operation ${index}: Insufficient funds`;
                      break;
                    case 'op_no_trust':
                      errorMessage = `Operation ${index}: No trustline exists`;
                      break;
                    case 'op_no_issuer':
                      errorMessage = `Operation ${index}: Asset issuer does not exist`;
                      break;
                    case 'op_no_destination':
                      errorMessage = `Operation ${index}: Destination account does not exist`;
                      break;
                    case 'op_line_full':
                      errorMessage = `Operation ${index}: Trustline is full`;
                      break;
                    case 'op_low_reserve':
                      errorMessage = `Operation ${index}: Source or destination account balance would fall below minimum reserve`;
                      break;
                    case 'op_malformed':
                      errorMessage = `Operation ${index}: Operation is malformed`;
                      break;
                  }
                  
                  return errorMessage;
                });
                
                throw new Error(`Transaction operation errors: ${opErrors.join(', ')}`);
              } 
              else if (resultCodes.transaction) {
                throw new Error(`Transaction error: ${resultCodes.transaction}`);
              }
            }
            
            if (txError.response && txError.response.status === 429) {
              const retryAfter = parseInt(txError.response.headers['retry-after'] || '5');
              console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
              await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
              retryCount++;
              continue;
            }
          }
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
      const asset = new Asset(assetCode, StellarConfig.ASSET.ISSUER);
      
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
        fee: StellarConfig.TRANSACTION.FEE || '100'
      })
        .addOperation(Operation.payment({
          destination: toPublicKey,
          asset: asset,
          amount: amount.toString()
        }))
        .setTimeout(StellarConfig.TRANSACTION.DEFAULT_TIMEOUT || 180)
        .build();
      
      transaction.sign(source);
      
      return await this.submitTransactionWithRetry(transaction);
    } catch (error) {
      console.error('Error transferring NFT:', error);
      throw error;
    }
  }
  
  async getNFTBalance(publicKey, assetCode) {
    try {
      await this.ensureInitialized();
      
      const account = await this.getAccount(publicKey);
      const asset = new Asset(assetCode, StellarConfig.ASSET.ISSUER);
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
  
  async getTransactionHistory(publicKey) {
    try {
      await this.ensureInitialized();
      
      return await this.server.transactions()
        .forAccount(publicKey)
        .call();
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }
}

export default new StellarService();

