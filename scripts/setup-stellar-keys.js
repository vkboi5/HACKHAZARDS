const { Keypair } = require('@stellar/stellar-sdk');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

try {
    // Load existing .env file
    const envPath = path.resolve(__dirname, '../.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envConfig = dotenv.parse(envContent);

    // Generate new Stellar keypair
    const pair = Keypair.random();
    const publicKey = pair.publicKey();
    const secretKey = pair.secret();

    // Update env variables
    envConfig.REACT_APP_STELLAR_ISSUER_PUBLIC_KEY = publicKey;
    envConfig.REACT_APP_STELLAR_ISSUER_SECRET_KEY = secretKey;

    // Convert back to .env format
    const newEnvContent = Object.entries(envConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Write back to .env file
    fs.writeFileSync(envPath, newEnvContent);

    console.log('✅ Stellar keys generated and .env file updated successfully!');
    console.log('\n🔑 Your Stellar Keys:');
    console.log('Public Key:', publicKey);
    console.log('Secret Key:', secretKey);
    console.log('\n⚠️  IMPORTANT:');
    console.log('1. Save these keys securely - they are now in your .env file');
    console.log('2. Fund your account using the Friendbot:');
    console.log(`   ${envConfig.REACT_APP_STELLAR_FRIENDBOT_URL}?addr=${publicKey}`);
    console.log('\n🚀 Next steps:');
    console.log('1. Visit the Friendbot URL to fund your account with testnet XLM');
    console.log('2. Go to the Stellar Setup page in your application');
    console.log('3. Test your account setup using the provided tools');
} catch (error) {
    console.error('Error generating Stellar keys:', error.message);
    process.exit(1);
} 