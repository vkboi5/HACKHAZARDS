# WalletConnect Integration

This project has been updated to use WalletConnect for wallet integration, allowing support for mobile wallets like LOBSTR and Solar Wallet.

## Setup

1. Install the required dependencies:
   ```bash
   yarn add @reown/walletkit @walletconnect/utils @walletconnect/core
   ```

2. Create a WalletConnect project:
   - Go to [https://cloud.reown.com](https://cloud.reown.com)
   - Create a new project
   - Copy your Project ID

3. Configure environment variables:
   - Copy `.env.sample` to `.env.local`
   - Update `REACT_APP_WALLETCONNECT_PROJECT_ID` with your Project ID
   - Note: The Project ID `7d2362093ac6056f7c103d5e6aa539a8` is already configured in this project

## Integration Details

The integration uses the following components:

- `WalletConnectProvider.js` - The main provider component that manages wallet connections
- `WalletConnectConnection.js` - The UI component for displaying wallet connection status
- `WalletConnect.css` - Styles for the WalletConnect components

## Supported Wallets

This integration supports:

- LOBSTR Wallet (https://lobstr.co/)
- Solar Wallet (https://solarwallet.io/)
- Any other Stellar wallet that supports WalletConnect

## How it Works

1. The user clicks "Connect Wallet"
2. A modal appears with wallet connection options
3. When selecting WalletConnect, a QR code is displayed
4. The user scans the QR code with their mobile wallet app
5. Once connected, the wallet can be used to sign transactions

## Testing

To test the integration:

1. Start the application with `yarn start`
2. Go to the wallet connection page
3. Click "Connect Wallet"
4. Choose WalletConnect
5. Scan the QR code with a compatible mobile wallet
6. Approve the connection in your wallet app

## API Reference

For more information about the WalletKit API, see:
- [Reown WalletKit Documentation](https://docs.reown.com/walletkit/web/usage)
- [WalletConnect Documentation](https://docs.walletconnect.com/) 