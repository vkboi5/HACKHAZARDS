# 🚨 CRITICAL SECURITY ALERT 🚨

## Your Credentials Have Been Compromised

**IMPORTANT: Your private keys and API credentials have been exposed and MUST be regenerated immediately!**

This is a critical security issue that requires your immediate attention. The following sensitive credentials have been exposed:

- Ethereum private key
- Stellar secret key
- Infura API key
- Etherscan API key
- Pinata API credentials
- JWT secrets

## 🛑 Immediate Actions Required

1. **Stop any running applications** that use these credentials
2. **Regenerate ALL exposed credentials** following the guide below
3. **Update your environment files** with the new credentials
4. **Check for unauthorized activity** on all associated accounts

## Credential Regeneration Guide

### 1. Ethereum Private Key

Your Ethereum wallet has been compromised. You must immediately:

1. Create a new wallet using MetaMask or another wallet provider
2. Transfer any funds from your compromised wallet to the new wallet
3. Update your `.env` file with the new private key

```
# In .env
PRIVATE_KEY=your_new_private_key
```

### 2. Stellar Secret Key

Your Stellar account has been compromised. You must immediately:

1. Create a new Stellar account using the [Stellar Laboratory](https://laboratory.stellar.org/#account-creator)
2. Transfer any assets from your compromised account to the new account
3. Update your `.env` file with the new secret key

```
# In .env
REACT_APP_STELLAR_ISSUER_PUBLIC_KEY=your_new_public_key
REACT_APP_STELLAR_ISSUER_SECRET_KEY=your_new_secret_key
```

### 3. Infura API Key

1. Log in to your [Infura Dashboard](https://infura.io/dashboard)
2. Revoke the compromised API key
3. Create a new project and API key
4. Update your `.env` file:

```
# In .env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_new_infura_key
REACT_APP_INFURA_KEY=your_new_infura_key
```

### 4. Etherscan API Key

1. Log in to your [Etherscan account](https://etherscan.io/myapikey)
2. Revoke the compromised API key
3. Generate a new API key
4. Update your `.env` file:

```
# In .env
ETHERSCAN_API_KEY=your_new_etherscan_key
```

### 5. Pinata API Credentials

1. Log in to your [Pinata Dashboard](https://app.pinata.cloud/keys)
2. Revoke the compromised API key
3. Create a new API key with the necessary permissions
4. Update your `.env` file:

```
# In .env
REACT_APP_PINATA_API_KEY=your_new_pinata_key
REACT_APP_PINATA_API_SECRET=your_new_pinata_secret
```

### 6. JWT and Encryption Secrets

1. Generate new random strings (at least 32 characters long)
2. Update your `.env` file:

```
# In .env
REACT_APP_ENCRYPTION_KEY=your_new_encryption_key
REACT_APP_JWT_SECRET=your_new_jwt_secret
```

## Preventing Future Credential Exposure

To prevent future credential exposure:

1. **NEVER commit `.env` files to version control**
2. Use `.env.example` files with placeholder values
3. Add `.env` to your `.gitignore` file
4. Consider using a secrets management service like HashiCorp Vault or AWS Secrets Manager
5. Regularly rotate your credentials

## Verifying Your Changes

After regenerating all credentials, run the validation script:

```bash
# For Windows
.\scripts\validate-env.ps1

# For Linux/Mac
bash scripts/validate-env.sh
```

## Security Resources

- [MetaMask Security Best Practices](https://metamask.zendesk.com/hc/en-us/articles/360015489591-Basic-Safety-Tips)
- [Stellar Account Security](https://developers.stellar.org/docs/tutorials/safely-store-your-keys)
- [API Key Security Best Practices](https://developers.cloudflare.com/api/tokens/best-practices/)

---

If you need further assistance, please consult with a security professional immediately.

