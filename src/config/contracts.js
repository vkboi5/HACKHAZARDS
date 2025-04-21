export const CONTRACTS = {
  NFT: {
    address: process.env.REACT_APP_NFT_ADDRESS,
    abi: [
      // Add your NFT contract ABI here
      "function mint(address to, string memory tokenURI) public returns (uint256)",
      "function ownerOf(uint256 tokenId) public view returns (address)",
      "function tokenURI(uint256 tokenId) public view returns (string memory)",
    ]
  },
  MARKETPLACE: {
    address: process.env.REACT_APP_MARKETPLACE_ADDRESS,
    abi: [
      // Add your Marketplace contract ABI here
      "function listItem(address nftAddress, uint256 tokenId, uint256 price) public",
      "function buyItem(address nftAddress, uint256 tokenId) public payable",
      "function getListing(address nftAddress, uint256 tokenId) public view returns (tuple(address seller, uint256 price, bool isActive))",
    ]
  }
};

export const NETWORK_CONFIG = {
  name: process.env.REACT_APP_ETHEREUM_NETWORK || 'sepolia',
  chainId: process.env.REACT_APP_ETHEREUM_NETWORK === 'mainnet' ? 1 : 11155111, // Sepolia chain ID
  rpcUrl: process.env.REACT_APP_INFURA_KEY 
    ? `https://${process.env.REACT_APP_ETHEREUM_NETWORK}.infura.io/v3/${process.env.REACT_APP_INFURA_KEY}`
    : process.env.SEPOLIA_RPC_URL,
};

export default {
  CONTRACTS,
  NETWORK_CONFIG
}; 