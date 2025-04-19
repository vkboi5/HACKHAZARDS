import React, { createContext, useContext, useState, useEffect } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Core } from "@walletconnect/core";
import { WalletKit, WalletKitTypes } from "@reown/walletkit";
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import './WalletConnect.css';

// Create a context for the wallet
const WalletConnectContext = createContext();

// Custom hook to use the wallet context
export function useWalletConnect() {
  return useContext(WalletConnectContext);
}

export function WalletConnectProvider({ children }) {
  const [walletKit, setWalletKit] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [server, setServer] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [inputPublicKey, setInputPublicKey] = useState('');
  const [walletMethod, setWalletMethod] = useState(''); // 'walletconnect', 'manual', etc.
  const [session, setSession] = useState(null);
  const [balanceInXLM, setBalanceInXLM] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [qrError, setQrError] = useState(false);
  
  // Network type detection and configuration
  const getNetworkConfig = () => {
    // Determine network type from environment variables
    const isTestnet = !process.env.REACT_APP_USE_MAINNET || process.env.REACT_APP_USE_MAINNET.toLowerCase() !== 'true';
    const networkConfig = {
      networkUrl: isTestnet 
        ? (process.env.REACT_APP_HORIZON_TESTNET_URL || 'https://horizon-testnet.stellar.org')
        : (process.env.REACT_APP_HORIZON_MAINNET_URL || 'https://horizon.stellar.org'),
      networkPassphrase: isTestnet
        ? 'Test SDF Network ; September 2015'
        : 'Public Global Stellar Network ; September 2015',
      networkName: isTestnet ? 'TESTNET' : 'PUBLIC',
      chains: isTestnet 
        ? ['stellar:testnet']
        : ['stellar:pubnet'],
      defaultChain: isTestnet ? 'stellar:testnet' : 'stellar:pubnet',
      stellarChain: isTestnet ? 'testnet' : 'pubnet'
    };
    
    return networkConfig;
  };

  // Initialize the Stellar server and WalletKit
  useEffect(() => {
    async function initialize() {
      try {
        // Get network configuration
        const networkConfig = getNetworkConfig();
        console.log(`Initializing Stellar server with ${networkConfig.networkUrl} (${networkConfig.networkName})`);
        const stellarServer = new StellarSdk.Horizon.Server(networkConfig.networkUrl);
        setServer(stellarServer);

        // Initialize WalletKit with proper project ID
        const projectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID;
        
        // Validate project ID
        if (!projectId) {
          console.warn('WalletConnect Project ID not found in environment variables. Using fallback ID for development only.');
        }
        
        // Use provided ID or fallback for development (not recommended for production)
        const validProjectId = projectId || '7d2362093ac6056f7c103d5e6aa539a8';
        
        const core = new Core({
          projectId: projectId,
          logger: 'debug',
          relayUrl: 'wss://relay.walletconnect.com'
        });

        const walletKitInstance = await WalletKit.init({
          core,
          metadata: {
            name: "Galerie NFT Marketplace",
            description: "NFT Marketplace on Stellar",
            url: window.location.origin,
            icons: [window.location.origin + "/logo192.png"],
          },
          defaultChain: 'stellar:testnet',
          stellarChain: 'testnet'
        });

        // Setup event listeners for WalletKit
        setupWalletKitListeners(walletKitInstance);
        
        setWalletKit(walletKitInstance);
        
        // Check if we have a stored wallet connection
        const storedPublicKey = localStorage.getItem('stellarPublicKey');
        const storedWalletMethod = localStorage.getItem('stellarWalletMethod');
        
        if (storedPublicKey && storedWalletMethod === 'walletconnect') {
          // Attempt to restore the session
          const activeSessions = walletKitInstance.getActiveSessions();
          if (Object.keys(activeSessions).length > 0) {
            const sessionValues = Object.values(activeSessions);
            const stellarSession = sessionValues.find(s => 
              s.namespaces && s.namespaces.stellar && 
              s.namespaces.stellar.accounts.some(acc => acc.includes(storedPublicKey))
            );
            
            if (stellarSession) {
              setSession(stellarSession);
              setPublicKey(storedPublicKey);
              setWalletMethod('walletconnect');
              setIsConnected(true);
              loadAccountBalance(storedPublicKey, stellarServer);
            }
          }
        }
        
        setIsInitializing(false);
      } catch (err) {
        console.error('Initialization error:', err);
        setError(`Failed to initialize wallet: ${err.message}`);
        setIsInitializing(false);
      }
    }
    
    initialize();
  }, []);

  // Setup WalletKit event listeners
  const setupWalletKitListeners = (walletKitInstance) => {
    walletKitInstance.on('session_proposal', handleSessionProposal);
    walletKitInstance.on('session_request', handleSessionRequest);
    walletKitInstance.on('session_delete', handleSessionDelete);
    walletKitInstance.on('session_update', handleSessionUpdate);
  };

  // Handle session proposal
  const handleSessionProposal = async (proposal) => {
    try {
      // Build approved namespaces
      const approvedNamespaces = buildApprovedNamespaces({
        proposal: proposal.params,
        supportedNamespaces: {
          stellar: {
            chains: ['stellar:pubnet', 'stellar:testnet'],
            methods: ['stellar_signAndSubmitXDR', 'stellar_signXDR'],
            events: ['accountChanged', 'networkChanged'],
            accounts: publicKey ? [
              `stellar:pubnet:${publicKey}`,
              `stellar:testnet:${publicKey}`
            ] : []
          }
        }
      });

      const newSession = await walletKit.approveSession({
        id: proposal.id,
        namespaces: approvedNamespaces
      });

      setSession(newSession);
      
      // Extract public key from accounts
      if (newSession.namespaces.stellar && newSession.namespaces.stellar.accounts.length > 0) {
        const accountParts = newSession.namespaces.stellar.accounts[0].split(':');
        const extractedPublicKey = accountParts[accountParts.length - 1];
        
        setPublicKey(extractedPublicKey);
        setIsConnected(true);
        setWalletMethod('walletconnect');
        
        // Store in localStorage
        localStorage.setItem('stellarPublicKey', extractedPublicKey);
        localStorage.setItem('stellarWalletMethod', 'walletconnect');
        
        // Load account balance
        loadAccountBalance(extractedPublicKey, server);
      }

      setShowConnectModal(false);
    } catch (error) {
      console.error('Error approving session:', error);
      setError(`Failed to connect wallet: ${error.message}`);
      
      try {
        await walletKit.rejectSession({
          id: proposal.id,
          reason: getSdkError("USER_REJECTED")
        });
      } catch (rejectError) {
        console.error('Error rejecting session:', rejectError);
      }
    }
  };

  // Handle session request
  const handleSessionRequest = async (request) => {
    try {
      // Handle different types of requests
      if (request.params.request.method === 'stellar_signXDR') {
        // Handle signing request
        const { xdr } = request.params.request.params;
        
        // For demo purposes, auto-approve. In production, show a confirmation dialog
        const signatureResult = await signTransaction(xdr);
        
        // Respond to the request
        await walletKit.respondSessionRequest({
          topic: request.topic,
          response: {
            id: request.id,
            jsonrpc: '2.0',
            result: signatureResult
          }
        });
      } else if (request.params.request.method === 'stellar_signAndSubmitXDR') {
        // Handle sign and submit request
        const { xdr } = request.params.request.params;
        
        // For demo purposes, auto-approve. In production, show a confirmation dialog
        const result = await signAndSubmitTransaction(xdr);
        
        // Respond to the request
        await walletKit.respondSessionRequest({
          topic: request.topic,
          response: {
            id: request.id,
            jsonrpc: '2.0',
            result: result
          }
        });
      } else {
        // Reject unsupported methods
        await walletKit.respondSessionRequest({
          topic: request.topic,
          response: {
            id: request.id,
            jsonrpc: '2.0',
            error: {
              code: 4001,
              message: 'Method not supported'
            }
          }
        });
      }
    } catch (error) {
      console.error('Error handling session request:', error);
      
      // Respond with error
      await walletKit.respondSessionRequest({
        topic: request.topic,
        response: {
          id: request.id,
          jsonrpc: '2.0',
          error: {
            code: 4000,
            message: error.message
          }
        }
      });
    }
  };

  // Handle session delete
  const handleSessionDelete = () => {
    disconnectWallet();
  };

  // Handle session update
  const handleSessionUpdate = (updatedSession) => {
    setSession(updatedSession);
  };

  // Load account balance
  const loadAccountBalance = async (address, serverInstance) => {
    try {
      const account = await serverInstance.loadAccount(address);
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      if (xlmBalance) {
        setBalanceInXLM(parseFloat(xlmBalance.balance));
      }
    } catch (error) {
      console.error("Failed to load account balance:", error);
    }
  };

  // Connect to a wallet
  const connectWallet = async () => {
    try {
      setShowConnectModal(true);
    } catch (err) {
      console.error('Connect wallet error:', err);
      setError(`Failed to connect wallet: ${err.message}`);
    }
  };

  // Connect using WalletConnect
  const connectWithWalletConnect = async () => {
    try {
      if (!walletKit) {
        throw new Error('WalletKit not initialized');
      }

      // Generate pairing URI
      const { uri, topic } = await walletKit.core.pairing.create();
      
      console.log('Generated pairing URI:', uri);
      
      // Store the URI for QR code display
      setQrCodeUrl(uri);

      // Start pairing
      try {
        console.log('Starting pairing with URI');
        await walletKit.pair({ uri });
        console.log('Pairing initiated successfully');
      } catch (pairError) {
        console.error('Error during pairing:', pairError);
        throw pairError;
      }
      
      // The rest of the connection process will be handled by the session_proposal event
    } catch (err) {
      console.error('WalletConnect error:', err);
      setError(`Failed to connect with WalletConnect: ${err.message}`);
    }
  };

  // Connect using LOBSTR specifically 
  const connectWithLOBSTR = async () => {
    try {
      if (!walletKit) {
        throw new Error('WalletKit not initialized');
      }

      // Generate pairing URI
      const { uri } = await walletKit.core.pairing.create();
      console.log('Generated LOBSTR pairing URI:', uri);
      
      // Store the URI for QR code display
      setQrCodeUrl(uri);

      // Create LOBSTR deep links for different platforms
      // Note: LOBSTR supports multiple deep link formats
      const lobstrUniversalLink = `https://lobstr.co/wc?uri=${encodeURIComponent(uri)}`;
      const lobstrDeepLink = `lobstr://wc?uri=${encodeURIComponent(uri)}`;
      console.log('LOBSTR universal link:', lobstrUniversalLink);
      console.log('LOBSTR deep link:', lobstrDeepLink);

      // More comprehensive mobile detection
      const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);
      
      // Initiate pairing regardless of platform to ensure connection works
      try {
        await walletKit.pair({ uri });
        console.log('Pairing initiated successfully for LOBSTR');
      } catch (pairError) {
        console.error('Error during LOBSTR pairing:', pairError);
        // Continue with deep linking even if pairing has an error
        // We don't throw here to allow fallback to QR code
      }
      
      if (isMobile) {
        // Try to open the app with platform-specific approach
        try {
          // Create an invisible iframe to try opening the app without navigating away
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          
          // Set a timeout to detect if app opening fails
          const appOpenTimeout = setTimeout(() => {
            // If we're still here after timeout, app didn't open
            // Redirect to app store or use universal link as fallback
            if (isIOS) {
              // For iOS, use universal link as primary method
              window.location.href = lobstrUniversalLink;
              
              // Set another timeout to check if universal link worked
              setTimeout(() => {
                // If we're still here, redirect to App Store
                window.location.href = 'https://apps.apple.com/app/lobstr-stellar-wallet/id1404357892';
              }, 2000);
            } else if (isAndroid) {
              // For Android, redirect to Play Store
              window.location.href = 'https://play.google.com/store/apps/details?id=com.lobstr.client';
            }
          }, 1500);
          
          // Try opening the app with deep link
          if (isIOS) {
            // iOS handles universal links better
            window.location.href = lobstrUniversalLink;
          } else {
            // Android prefers deep links
            iframe.src = lobstrDeepLink;
            // Also try direct navigation after a short delay
            setTimeout(() => {
              window.location.href = lobstrDeepLink;
            }, 100);
          }
          
          // Clean up iframe
          setTimeout(() => {
            document.body.removeChild(iframe);
            clearTimeout(appOpenTimeout);
          }, 2000);
          
        } catch (deepLinkError) {
          console.error('Deep linking error:', deepLinkError);
          // Show QR code as fallback and keep it displayed
          setError("Couldn't open LOBSTR app automatically. Please scan the QR code or install LOBSTR wallet.");
        }
      } else {
        // On desktop, show buttons to open web wallet or copy link
        // The buttons are already added in the modal component
        console.log('On desktop - showing QR code and buttons');
        // We keep the QR code displayed for desktop users
      }
    } catch (err) {
      console.error('LOBSTR connect error:', err);
      setError(`Failed to connect with LOBSTR: ${err.message}`);
    }
  };

  // Connect using Solar specifically
  const connectWithSolar = async () => {
    try {
      if (!walletKit) {
        throw new Error('WalletKit not initialized');
      }

      // Generate pairing URI
      const { uri } = await walletKit.core.pairing.create();
      console.log('Generated Solar pairing URI:', uri);
      
      // Store the URI for QR code display
      setQrCodeUrl(uri);

      // Create Solar deep links for different platforms
      // Solar supports both universal and deep links
      const solarUniversalLink = `https://app.solarwallet.io/wc?uri=${encodeURIComponent(uri)}`;
      const solarDeepLink = `solarwallet://wc?uri=${encodeURIComponent(uri)}`;
      console.log('Solar universal link:', solarUniversalLink);
      console.log('Solar deep link:', solarDeepLink);

      // More comprehensive mobile detection
      const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);
      
      // Initiate pairing regardless of platform to ensure connection works
      try {
        await walletKit.pair({ uri });
        console.log('Pairing initiated successfully for Solar');
      } catch (pairError) {
        console.error('Error during Solar pairing:', pairError);
        // Continue with deep linking even if pairing has an error
        // We don't throw here to allow fallback to QR code
      }
      
      if (isMobile) {
        // Try to open the app with platform-specific approach
        try {
          // Create an invisible iframe to try opening the app without navigating away
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          
          // Set a timeout to detect if app opening fails
          const appOpenTimeout = setTimeout(() => {
            // If we're still here after timeout, app didn't open
            // Redirect to app store or use universal link as fallback
            if (isIOS) {
              // For iOS, use universal link as primary method
              window.location.href = solarUniversalLink;
              
              // Set another timeout to check if universal link worked
              setTimeout(() => {
                // If we're still here, redirect to App Store
                window.location.href = 'https://apps.apple.com/app/solar-stellar-wallet/id1424247359';
              }, 2000);
            } else if (isAndroid) {
              // For Android, redirect to Play Store
              window.location.href = 'https://play.google.com/store/apps/details?id=com.solarwallet.app';
            }
          }, 1500);
          
          // Try opening the app with deep link
          if (isIOS) {
            // iOS handles universal links better
            window.location.href = solarUniversalLink;
          } else {
            // Android prefers deep links
            iframe.src = solarDeepLink;
            // Also try direct navigation after a short delay
            setTimeout(() => {
              window.location.href = solarDeepLink;
            }, 100);
          }
          
          // Clean up iframe
          setTimeout(() => {
            document.body.removeChild(iframe);
            clearTimeout(appOpenTimeout);
          }, 2000);
          
        } catch (deepLinkError) {
          console.error('Deep linking error:', deepLinkError);
          // Show QR code as fallback and keep it displayed
          setError("Couldn't open Solar app automatically. Please scan the QR code or install Solar wallet.");
        }
      } else {
        // On desktop, show buttons to open web wallet or copy link
        // The buttons are already added in the modal component
        console.log('On desktop - showing QR code and buttons');
        // We keep the QR code displayed for desktop users
      }
    } catch (err) {
      console.error('Solar connect error:', err);
      setError(`Failed to connect with Solar: ${err.message}`);
    }
  };

  // Handle manual public key connection
  const handleManualConnect = async () => {
    try {
      if (!inputPublicKey) {
        setError('Please enter a public key');
        return;
      }

      // Validate the public key format
      try {
        StellarSdk.StrKey.decodeEd25519PublicKey(inputPublicKey);
      } catch (e) {
        setError('Invalid Stellar public key format');
        return;
      }

      // Test if the account exists with better error handling
      try {
        const account = await server.loadAccount(inputPublicKey);
        
        // Check if account has sufficient XLM balance
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        if (xlmBalance) {
          setBalanceInXLM(parseFloat(xlmBalance.balance));
          
          if (parseFloat(xlmBalance.balance) < 5) {
            console.warn(`Account has low XLM balance: ${xlmBalance.balance}`);
            setError(`Warning: Your account has a low XLM balance (${xlmBalance.balance}). You may need at least 5 XLM to perform operations.`);
          }
        }
        
        setPublicKey(inputPublicKey);
        setIsConnected(true);
        setWalletMethod('manual');
        setError(null);
        
        // Store the connection details
        localStorage.setItem('stellarPublicKey', inputPublicKey);
        localStorage.setItem('stellarWalletMethod', 'manual');
        
        setShowConnectModal(false);
      } catch (accountError) {
        console.error('Account validation error:', accountError);
        if (accountError.response && accountError.response.status === 404) {
          setError('Account not found on the Stellar network. You may need to create and fund this account first.');
          return;
        }
        setError(`Failed to validate account: ${accountError.message}`);
      }
    } catch (err) {
      console.error('Manual connect error:', err);
      setError(`Failed to connect: ${err.message}`);
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      if (session && walletKit) {
        await walletKit.disconnectSession({
          topic: session.topic,
          reason: getSdkError("USER_DISCONNECTED"),
        });
      }
      
      setPublicKey(null);
      setIsConnected(false);
      setWalletMethod('');
      setSession(null);
      setBalanceInXLM(0);
      localStorage.removeItem('stellarPublicKey');
      localStorage.removeItem('stellarWalletMethod');
    } catch (err) {
      console.error('Disconnect error:', err);
      setError(`Failed to disconnect: ${err.message}`);
    }
  };

  // Sign transaction
  const signTransaction = async (xdr) => {
    try {
      if (!isConnected) {
        throw new Error('Wallet not connected');
      }

      if (walletMethod === 'walletconnect' && session) {
        // If we're using WalletConnect, we'll need to send a signing request to the wallet
        // This function should be called from a user action to sign a transaction
        // Return the signature for use
        return { signedXDR: xdr }; // Placeholder - actual signing happens via session requests
      } else if (walletMethod === 'manual') {
        // For manual entry wallets, we cannot sign transactions directly
        throw new Error('Manual wallet connection cannot sign transactions. Please use WalletConnect.');
      } else {
        throw new Error('Unknown wallet method or no active session');
      }
    } catch (err) {
      console.error('Transaction signing error:', err);
      throw err;
    }
  };

  // Sign and submit transaction
  const signAndSubmitTransaction = async (xdr) => {
    try {
      if (!isConnected) {
        throw new Error('Wallet not connected');
      }

      if (walletMethod === 'walletconnect' && session) {
        // If we're using WalletConnect, we'll need to send a sign and submit request to the wallet
        // This is a placeholder - actual signing and submission happens via session requests
        return { hash: 'placeholder_transaction_hash' };
      } else if (walletMethod === 'manual') {
        throw new Error('Manual wallet connection cannot sign and submit transactions.');
      } else {
        throw new Error('Unknown wallet method or no active session');
      }
    } catch (err) {
      console.error('Transaction signing and submission error:', err);
      throw err;
    }
  };

  // Get account details
  const getAccountDetails = async (accountAddress = null) => {
    try {
      const address = accountAddress || publicKey;
      if (!address) {
        throw new Error('No public key available');
      }
      
      const account = await server.loadAccount(address);
      return account;
    } catch (err) {
      console.error('Error getting account details:', err);
      throw err;
    }
  };

  // Connect Modal component
  const ConnectModal = () => {
    if (!showConnectModal) return null;
    
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h3>Connect Wallet</h3>
            <button className="close-button" onClick={() => setShowConnectModal(false)}>×</button>
          </div>
          <div className="modal-body">
            <div className="connection-options">
              <div className="connection-option" onClick={connectWithWalletConnect}>
                <div className="option-icon">
                  <img src="/assets/walletconnect-logo.svg" alt="WalletConnect" />
                </div>
                <div className="option-content">
                  <h4>WalletConnect</h4>
                  <p>Connect with any WalletConnect compatible wallet</p>
                </div>
              </div>
              
              <div className="connection-option" onClick={connectWithLOBSTR}>
                <div className="option-icon">
                  <img 
                    src="/assets/lobstr-logo.svg" 
                    alt="LOBSTR" 
                    style={{maxWidth: '40px'}}
                  />
                </div>
                <div className="option-content">
                  <h4>LOBSTR Wallet</h4>
                  <p>Connect directly with LOBSTR wallet</p>
                </div>
              </div>
              
              <div className="connection-option" onClick={connectWithSolar}>
                <div className="option-icon">
                  <img 
                    src="/assets/solar-logo.svg" 
                    alt="Solar" 
                    style={{maxWidth: '40px'}}
                  />
                </div>
                <div className="option-content">
                  <h4>Solar Wallet</h4>
                  <p>Connect directly with Solar wallet</p>
                </div>
              </div>
              
              {qrCodeUrl && (
                <div className="qr-code-container">
                  <h4>Scan with your wallet</h4>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCodeUrl)}`} 
                    alt="QR Code" 
                    className="qr-code"
                  />
                  <div className="uri-text">
                    <p>If scanning doesn't work, you can copy this URI to your wallet app:</p>
                    <textarea 
                      readOnly 
                      value={qrCodeUrl} 
                      onClick={(e) => e.target.select()} 
                      className="uri-textarea"
                    />
                    <div className="wallet-buttons">
                      <button 
                        className="wallet-button lobstr-button"
                        onClick={() => {
                          const lobstrUniversalLink = `https://lobstr.co/wc?uri=${encodeURIComponent(qrCodeUrl)}`;
                          const lobstrDeepLink = `lobstr://wc?uri=${encodeURIComponent(qrCodeUrl)}`;
                          // Handle both universal and deep links for LOBSTR
                          const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                          const isAndroid = /Android/i.test(navigator.userAgent);
                          const isMobile = isIOS || isAndroid;
                          
                          if (isMobile) {
                            // On mobile, try the deep link first
                            try {
                              // For iOS, universal links work better
                              if (isIOS) {
                                window.location.href = lobstrUniversalLink;
                              } else {
                                // For Android, try deep link first
                                window.location.href = lobstrDeepLink;
                              }
                            } catch (e) {
                              console.error("Error opening LOBSTR app:", e);
                              // Fallback to universal link if deep link fails
                              window.location.href = lobstrUniversalLink;
                            }
                          } else {
                            // On desktop, open in new tab
                            window.open(lobstrUniversalLink, '_blank');
                          }
                        }}
                      >
                        Open in LOBSTR
                      </button>
                      
                      <button 
                        className="wallet-button solar-button"
                        onClick={() => {
                          const solarUniversalLink = `https://app.solarwallet.io/wc?uri=${encodeURIComponent(qrCodeUrl)}`;
                          const solarDeepLink = `solarwallet://wc?uri=${encodeURIComponent(qrCodeUrl)}`;
                          // Handle both universal and deep links for Solar
                          const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                          const isAndroid = /Android/i.test(navigator.userAgent);
                          const isMobile = isIOS || isAndroid;
                          
                          if (isMobile) {
                            // On mobile, try the deep link first
                            try {
                              // For iOS, universal links work better
                              if (isIOS) {
                                window.location.href = solarUniversalLink;
                              } else {
                                // For Android, try deep link first
                                window.location.href = solarDeepLink;
                              }
                            } catch (e) {
                              console.error("Error opening Solar app:", e);
                              // Fallback to universal link if deep link fails
                              window.location.href = solarUniversalLink;
                            }
                          } else {
                            // On desktop, open in new tab
                            window.open(solarUniversalLink, '_blank');
                          }
                        }}
                      >
                        Open in Solar
                      </button>
                      
                      <button 
                        className="copy-uri-button"
                        onClick={() => {
                          navigator.clipboard.writeText(qrCodeUrl);
                          alert('URI copied to clipboard');
                        }}
                      >
                        Copy URI
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="manual-connection">
                <h4>Manual Connection</h4>
                <p>Enter your Stellar public key (starts with G...)</p>
                <input 
                  type="text" 
                  placeholder="Stellar Public Key" 
                  value={inputPublicKey}
                  onChange={(e) => setInputPublicKey(e.target.value)}
                />
                <button onClick={handleManualConnect}>Connect</button>
              </div>
            </div>
            
            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      </div>
    );
  };

  // Value object for the context
  const value = {
    publicKey,
    isConnected,
    error,
    isInitializing,
    connectWallet,
    disconnectWallet,
    signTransaction,
    signAndSubmitTransaction,
    getAccountDetails,
    balanceInXLM,
    walletMethod
  };

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
      <ConnectModal />
    </WalletConnectContext.Provider>
  );
} 