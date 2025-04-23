![github-submission-banner](https://github.com/user-attachments/assets/a1493b84-e4e2-456e-a791-ce35ee2bcf2f)

# 🚀 Galerie - Stellar NFT Marketplace

> Revolutionizing digital art ownership through Stellar blockchain technology

---

## 📌 Problem Statement

**Problem Statement 6 – Implementing Stellar Technologies**

---

## 🎯 Objective

Galerie addresses the challenge of accessible and efficient NFT creation and trading on the Stellar blockchain. Traditional NFT platforms often have high gas fees and technical barriers, making them inaccessible to many artists and collectors.

Our marketplace provides a user-friendly platform for artists to tokenize their digital art as NFTs on Stellar's energy-efficient blockchain with minimal fees. For collectors, we offer a curated marketplace to discover, collect, and trade unique digital assets while ensuring proper attribution and royalties for creators.

---

## 🧠 Team & Approach

### Team Name:  
`StellarMinds`

### Team Members:  
- Sarang Kadukar (Frontend Developer)  
- T.V.Vishalkirthik (Backend Developer)    

### Your Approach:  
- We chose this problem to democratize NFT technology by leveraging Stellar's low-cost, fast, and energy-efficient blockchain.
- Key challenges addressed include seamless wallet integration, metadata management for NFTs, and creating an intuitive user experience for non-technical users.
- During development, we pivoted from a complex multi-blockchain approach to focus exclusively on Stellar, allowing us to create a more cohesive and optimized user experience.

---

## 🛠️ Tech Stack

### Core Technologies Used:
- Frontend: React.js, React Router, Bootstrap, CSS3
- Backend: Node.js, Express
- Storage: IPFS via Pinata for decentralized metadata and image storage
- Blockchain: Stellar SDK (v13.2.0) for token issuance and management
- Wallet Integration: Freighter API (v4.1.0) for seamless wallet connection
- APIs: Stellar Horizon API for blockchain interactions

### Sponsor Technologies Used:
- [✅] **Stellar:** Used for NFT issuance, wallet integration, token transfers, and marketplace transactions

---

## ✨ Key Features

- ✅ **Seamless Stellar Wallet Integration**: Connect with Freighter wallet to create, buy, and sell NFTs
- ✅ **User-Friendly NFT Creation**: Simple interface to mint NFTs on Stellar with just a few clicks
- ✅ **Decentralized Content Storage**: All NFT metadata and images stored on IPFS via Pinata for permanence
- ✅ **Robust Transaction Management**: Secure signing and submitting of Stellar transactions
- ✅ **Marketplace Listings**: List and browse NFTs with detailed metadata and pricing
- ✅ **Social Engagement**: Like and interact with NFT listings to boost visibility
- ✅ **Featured Collections**: Curated display of top NFT collections on the platform
- ✅ **Mobile-Responsive Interface**: Fully functional on all device sizes

---

## 📽️ Demo & Deliverables

- **Demo Video Link:** [Coming Soon]  
- **Pitch Deck Link:** [Coming Soon]  

---

## ✅ Tasks & Bonus Checklist

- [✅] **All members of the team completed the mandatory task - Followed at least 2 of our social channels and filled the form**
- [✅] **All members of the team completed Bonus Task 1 - Sharing of Badges and filled the form (2 points)**
- [✅] **All members of the team completed Bonus Task 2 - Signing up for Sprint.dev and filled the form (3 points)**

---

## 🧪 How to Run the Project

### Requirements:
- Node.js v16+ 
- Stellar account (testnet for development)
- Pinata API keys for IPFS storage
- Freighter browser extension installed (Chrome or Firefox)

### Local Setup:
```bash
# Clone the repo
git clone https://github.com/your-team/galerie-nft-marketplace

# Install dependencies
cd galerie-nft-marketplace
npm install

# Configure environment variables
# Create a .env file with the following:
REACT_APP_STELLAR_NETWORK=TESTNET
REACT_APP_HORIZON_URL=https://horizon-testnet.stellar.org
REACT_APP_STELLAR_ISSUER_PUBLIC_KEY=your_issuer_public_key
REACT_APP_STELLAR_ISSUER_SECRET_KEY=your_issuer_secret_key
REACT_APP_PINATA_API_KEY=your_pinata_api_key
REACT_APP_PINATA_API_SECRET=your_pinata_api_secret
REACT_APP_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Start development server
npm start
```

### Installation Troubleshooting

If you encounter issues with dependencies:

```bash
# Clear npm cache and reinstall
npm cache clean --force
npm install

# If you're using Yarn
yarn cache clean
yarn install
```

For issues with Freighter wallet connection:
1. Ensure the Freighter extension is properly installed
2. Check that your Freighter wallet is unlocked
3. Make sure you're on the correct network (Testnet for development)

---

## 🧬 Future Scope

- 📈 **Multi-collection Support**: Enable creators to organize NFTs into themed collections
- 🛡️ **Enhanced Security**: Implement multisig authorization for high-value NFT transactions
- 🌐 **Cross-chain Bridge**: Enable interoperability with other blockchains like Ethereum
- 💰 **Auction Functionality**: Add timed auctions with automatic settlement
- 🔍 **Advanced Search & Discovery**: Implement AI-based recommendation system for NFT discovery
- 🔄 **Batch Operations**: Support for minting and managing multiple NFTs in a single transaction
- 📱 **Mobile Application**: Native mobile apps for iOS and Android platforms

---

## 📎 Resources / Credits

- [Stellar Developer Documentation](https://developers.stellar.org/docs)
- [Stellar Laboratory](https://laboratory.stellar.org/) for testing transactions
- [Freighter Wallet](https://www.freighter.app/) for Stellar account management
- [IPFS & Pinata](https://pinata.cloud/) for decentralized storage
- [React Icons](https://react-icons.github.io/react-icons/) for UI elements
- Special thanks to the Stellar Development Foundation for their support and documentation

---

## 🏁 Final Words

Building Galerie has been an incredible journey of discovery in the world of Stellar blockchain technology. Our team faced numerous challenges in working with custom assets and metadata on Stellar, but the platform's efficiency and low costs have proven it to be an excellent choice for NFT applications.

We're excited about the potential of bringing more artists and collectors into the world of digital ownership through the accessibility that Stellar provides. This hackathon has been a fantastic opportunity to push the boundaries of what's possible with blockchain technology while keeping the user experience simple and engaging.

---

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

### Stellar Account Configuration

For Stellar operations, you'll need:
1. A funded Stellar account on testnet (or mainnet for production)
2. Set your issuer and distribution account keys in `.env`:
   ```
   REACT_APP_STELLAR_ISSUER_PUBLIC_KEY=your_issuer_public_key
   REACT_APP_STELLAR_ISSUER_SECRET_KEY=your_issuer_secret_key
   ```

### Troubleshooting

If you encounter issues with Pinata uploads:
1. Verify your API keys are correct in the `.env` file
2. Check that your Pinata account has sufficient storage space
3. Ensure your network connection is stable
4. Check the browser console for specific error messages
5. Try regenerating your Pinata API keys if problems persist

For Stellar blockchain integration, make sure your Stellar account has sufficient funds for transactions.

