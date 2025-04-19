# Web3 based Digital NFT MarketPlace for Artisans and Collectors

## Technology Stack & Tools
- [Solidity](https://docs.soliditylang.org/en/latest/) (Writing Smart Contract)
- [Javascript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) (React & Testing)
- [Ethers](https://docs.ethers.io/v5/) (Blockchain Interaction)
- [Hardhat](https://hardhat.org/) (Development Framework)
- [Ipfs](https://ipfs.io/) (Metadata storage)
- [React routers](https://v5.reactrouter.com/) (Navigational components)

## Requirements For Initial Setup
- Install [NodeJS](https://nodejs.org/en/), should work with any node version below 16.5.0
- Install [Hardhat](https://hardhat.org/)


## Setting Up
### 1. Clone/Download the Repository

### 2. Install Dependencies:
```
$ cd Galerie
// Please delete the yarn.lock file
```
### 3. Install Dependencies:
```
// Also after deleting yarn.lock run this command 
if yarn 
$ yarn cache clean

if npm 
$ npm cache clean

$ npm install or yarn 

//if you face installing problems 
execute,  $yarn add --force  or $npm install --force
if that didn't work, try
$yarn add --legacy-peer-deps or $npm install --legacy-peer-deps

//if you face network issues
execute,  $yarn install --network-timeout 1000000
          
```
### 4. Set up Environment Variables 

⚠️ **SECURITY WARNING: Proper configuration of environment variables is critical for both functionality and security.**

1. Copy the .env.example file to a new file named .env:
   ```
   $ cp .env.example .env
   ```

2. Update the .env file with your own API keys and credentials:

   - **Pinata IPFS Storage Configuration**:
     1. Create an account at [Pinata Cloud](https://app.pinata.cloud)
     2. Generate API keys at [Pinata Keys](https://app.pinata.cloud/keys)
     3. Add to your .env file:
        ```
        REACT_APP_PINATA_API_KEY=your-pinata-api-key
        REACT_APP_PINATA_API_SECRET=your-pinata-api-secret
        ```

   - **Ethereum Configuration**:
     1. Create an account at [Infura](https://infura.io) 
     2. Create a new project and copy your API key
     3. Add to your .env file:
        ```
        REACT_APP_INFURA_KEY=your-infura-project-id
        SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-infura-project-id
        ```
     4. For Ethereum transaction signing:
        ```
        PRIVATE_KEY=your-ethereum-private-key
        ```
     5. For contract verification (optional):
        ```
        ETHERSCAN_API_KEY=your-etherscan-api-key
        ```

   - **Stellar Configuration**:
     1. Generate keys using [Stellar Laboratory](https://laboratory.stellar.org/#account-creator)
     2. Add to your .env file:
        ```
        REACT_APP_STELLAR_ISSUER_PUBLIC_KEY=your-stellar-public-key
        REACT_APP_STELLAR_ISSUER_SECRET_KEY=your-stellar-secret-key
        ```

3. **CRITICAL SECURITY PRACTICES**:
   - `.env` is in `.gitignore` for a reason - NEVER commit it to version control
   - Store backups of your `.env` file securely (password manager or encrypted storage)
   - Rotate credentials regularly (every 30-90 days)
   - Use different API keys for development and production
   - If you accidentally expose your credentials, regenerate ALL of them immediately

4. After updating your `.env` file, restart your development server:
   ```
   $ npm run start
   ```

### 5. Boot up local development blockchain
```
$ cd Galerie
$ npx hardhat node
```
- It's necessary to bootup the local blockchain network before setting up your metmask Network configurations for Hardhat! 

### 6. Download Metamask Browser Extension
- Ensure you correctly setup the Extension according to step 7 for proper working of the application

### 7. Connect development blockchain accounts to Metamask Browser Extension
- Copy private key of the addresses from the terminal
- Click on the account dropdown of Metamaks on top and you can select other accounts if you have one
- Click on Add account or hardware wallet and select Import Account and then enter that private key in the input box
- You have to navigate into Metamask account and connect your Metamask to hardhat blockchain, network 127.0.0.1:8545.
- If you have not added hardhat to the list of networks on your Metamask, open up a browser, click the fox icon, then click the top center dropdown button that lists all the available networksform should pop up then click add networks. A . For the "Network Name" field enter "Hardhat". For the "New RPC URL" field enter "http://127.0.0.1:8545". For the chain ID enter "31337". Then click save.  


### 8. Migrate Smart Contracts
`npx hardhat run src/backend/scripts/deploy.js --network https://galerie-one.vercel.app`

### 9. Run Tests
`$ npx hardhat test`
- Don't worry if tests fails, it won't affect the main workflow


### 10. Launch Frontend
`$ npm run start`

To test as a telegram mini app, install cloudflare extension on VSCode and start it to obtain public accessible URL , use that URL to setup the telegram mini app through
bot.js file or through botfather.

Also we have deployed our smart contracts on sepolia testnet so
the marketplace and other functionalities would work on this testnet or on default hardhat network.

Hopefully your telegram mini app should start without any errors! 

Check out our telegram mini app: [Click here!](https://t.me/Galeries_Telegram_Mini_App_Bot) 
//If you are accessing app through telegram please note that sometimes connecting to wallet and making transactions will be
tough and time-consuming , so patience is a key here!

## Environment Variables and Security

This project uses environment variables for configuration. We've provided a `.env.example` file that shows the required variables.

### Setting up Pinata for IPFS Storage

1. Create an account on [Pinata](https://app.pinata.cloud)
2. Generate API keys from the Pinata dashboard
3. Add these keys to your `.env` file:
   ```
   REACT_APP_PINATA_API_KEY=your_pinata_api_key
   REACT_APP_PINATA_API_SECRET=your_pinata_api_secret
   ```

### Troubleshooting Pinata Issues

If you encounter issues with Pinata uploads:

1. Verify your API keys are correct in the `.env` file
2. Check that your Pinata account has sufficient storage space
3. Ensure your network connection is stable
4. Check the browser console for specific error messages
5. Try regenerating your Pinata API keys if problems persist

For Stellar blockchain integration, make sure your Stellar account has sufficient funds for transactions.

