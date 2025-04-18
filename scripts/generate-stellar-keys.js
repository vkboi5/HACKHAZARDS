const { Keypair } = require('stellar-sdk');

function generateStellarKeys() {
  // Generate a new keypair
  const pair = Keypair.random();
  
  console.log('Generated Stellar Keypair:');
  console.log('Public Key:', pair.publicKey());
  console.log('Secret Key:', pair.secret());
  
  console.log('\nIMPORTANT: Save these keys securely!');
  console.log('Add them to your .env file as:');
  console.log(`STELLAR_ISSUER_PUBLIC_KEY=${pair.publicKey()}`);
  console.log(`STELLAR_ISSUER_SECRET_KEY=${pair.secret()}`);
  
  console.log('\nTo fund your account on testnet, visit:');
  console.log(`https://horizon-testnet.stellar.org/friendbot?addr=${pair.publicKey()}`);
}

generateStellarKeys(); 