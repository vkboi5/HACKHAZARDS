# MoonPay and Web3Auth Integration Setup

## Environment Variables

Add the following environment variables to your `.env` file in the project root:

```
# Web3Auth Configuration
REACT_APP_WEB3AUTH_CLIENT_ID=BBcQmJuTZ654xXIuA8wuJOiFaUfEymitYpwYyMtBYDpBbT71yWJmdV6_WNf0-A72nCSkPD7pecjrYGFujgfOb0c
REACT_APP_WEB3AUTH_CLIENT_SECRET=f75b5388f56406107467c328182aa351882ba4a317e92aee2e2869b7d9b3818a
REACT_APP_WEB3AUTH_NETWORK=sapphire_devnet

# MoonPay Configuration
REACT_APP_MOONPAY_PUBLISHABLE_KEY=pk_test_ncoCgtgPu13kFVcRBej9Vh6E87HoaY
REACT_APP_MOONPAY_SECRET_KEY=sk_test_IWszHH0KQnN6m7Hhif7SSEYicNZ1G5n5
REACT_APP_MOONPAY_WEBHOOK_KEY=wk_test_uJRzJm8G11Dh8KzZmau0wMiwQo8y2G5
REACT_APP_MOONPAY_ENVIRONMENT=sandbox
REACT_APP_MOONPAY_API_URL=https://api.sandbox.moonpay.com

# Stellar Configuration for Web3Auth
REACT_APP_USE_MAINNET=false
REACT_APP_HORIZON_TESTNET_URL=https://horizon-testnet.stellar.org
REACT_APP_HORIZON_MAINNET_URL=https://horizon.stellar.org
```

## MoonPay Setup Notes

1. These are test keys for the MoonPay sandbox environment
2. For production, you'll need to:
   - Change `REACT_APP_MOONPAY_ENVIRONMENT` to `production`
   - Update the `REACT_APP_MOONPAY_API_URL` to `https://api.moonpay.com`
   - Replace the test keys with production keys from your MoonPay dashboard

## Testing MoonPay Integration

When testing in sandbox mode:
- Use test card numbers like `4000 0566 5566 5556` for successful payments
- Set expiry date to any future date and CVV to any 3 digits
- For 3DS testing, use `4000 0027 6000 3184` and follow the prompts

## Security Considerations

1. **Never commit your .env file to version control**
2. **Keep your secret keys private** – only use the publishable key on the frontend
3. Set up proper CORS and webhook authentication for production
4. Use environment-specific keys for development and production

## Going to Production

Before going to production:
1. Create production API keys in the MoonPay dashboard
2. Update your webhook endpoints and authentication
3. Implement proper error handling and user feedback
4. Set up monitoring and logging for transactions

## Additional Resources

- [MoonPay API Documentation](https://www.moonpay.com/developers)
- [Web3Auth Documentation](https://web3auth.io/docs)
- [Stellar Documentation](https://developers.stellar.org/docs) 