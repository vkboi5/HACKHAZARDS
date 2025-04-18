const { Keypair } = require('stellar-sdk');
const fetch = require('node-fetch');

async function createStellarAccount() {
  try {
    // Generate a new keypair
    const pair = Keypair.random();
    
    console.log('Generated Stellar Keypair:');
    console.log('Public Key:', pair.publicKey());
    console.log('Secret Key:', pair.secret());
    
    // Fund the account using Friendbot (testnet only)
    console.log('\nFunding account with testnet XLM...');
    const response = await fetch(
      `https://horizon-testnet.stellar.org/friendbot?addr=${pair.publicKey()}`
    );
    
    const result = await response.json();
    
    if (result.success) {
      console.log('Account funded successfully!');
      console.log('Transaction Hash:', result.hash);
    } else {
      console.error('Failed to fund account:', result);
    }
    
    console.log('\nIMPORTANT: Save these keys securely!');
    console.log('Add them to your .env file as:');
    console.log(`STELLAR_ISSUER_PUBLIC_KEY=${pair.publicKey()}`);
    console.log(`STELLAR_ISSUER_SECRET_KEY=${pair.secret()}`);
    
  } catch (error) {
    console.error('Error creating Stellar account:', error);
  }
}

createStellarAccount(); 