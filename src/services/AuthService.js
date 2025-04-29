import axios from 'axios';
import * as StellarSdk from '@stellar/stellar-sdk';
import web3AuthStellarService from './web3AuthStellarService';

class AuthService {
  constructor() {
    this.users = JSON.parse(localStorage.getItem('users') || '[]');
    this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  }

  // Register a new user with email and password
  async register(email, password) {
    try {
      // Check if user already exists
      if (this.users.find(user => user.email === email)) {
        throw new Error('User already exists');
      }

      // Generate a new Stellar keypair for the user
      const keypair = StellarSdk.Keypair.random();
      const publicKey = keypair.publicKey();
      const privateKey = keypair.secret();

      // Create a new user object
      const newUser = {
        id: Date.now().toString(),
        email,
        password, // In a real app, this should be hashed
        publicKey,
        privateKey: this._encryptPrivateKey(privateKey), // In a real app, this should be properly encrypted
        createdAt: new Date().toISOString()
      };

      // Add the user to our local storage
      this.users.push(newUser);
      localStorage.setItem('users', JSON.stringify(this.users));

      // Create the Stellar account
      const { isNew } = await web3AuthStellarService.createStellarWallet(privateKey);
      
      // If the account is new, fund it
      if (isNew) {
        await web3AuthStellarService.airdropXLM(publicKey);
      }

      return {
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          publicKey: newUser.publicKey
        }
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw new Error(`Failed to register: ${error.message}`);
    }
  }

  // Login with email and password
  async login(email, password) {
    try {
      // Find the user
      const user = this.users.find(u => u.email === email && u.password === password);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Set the current user in local storage
      this.currentUser = {
        id: user.id,
        email: user.email,
        publicKey: user.publicKey
      };
      localStorage.setItem('currentUser', JSON.stringify(this.currentUser));

      // Connect to the Stellar wallet
      const privateKey = this._decryptPrivateKey(user.privateKey);
      
      return {
        success: true,
        user: this.currentUser,
        privateKey
      };
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(`Failed to login: ${error.message}`);
    }
  }

  // Check if user is logged in
  isLoggedIn() {
    return !!this.currentUser;
  }

  // Get current user info
  getCurrentUser() {
    return this.currentUser;
  }

  // Logout the current user
  logout() {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
    return { success: true };
  }

  // Very basic encryption (NOT for production use)
  _encryptPrivateKey(privateKey) {
    // In a real app, use proper encryption
    return privateKey;
  }

  // Very basic decryption (NOT for production use)
  _decryptPrivateKey(encryptedPrivateKey) {
    // In a real app, use proper decryption
    return encryptedPrivateKey;
  }
}

export default new AuthService(); 