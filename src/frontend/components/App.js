import React from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from './Navbar';
import Home from './Home.js';
import Create from './Create.js';
import MyListedItems from './MyListedItems.js';
import MyPurchases from './MyPurchases.js';
import './App.css';

// Wallet imports
import { WalletConnectProvider } from './WalletConnectProvider';
import { WalletConnectConnection } from './WalletConnectConnection';
import StellarSetup from './StellarSetup';

// Footer component with icon imports
import { FaTwitter, FaDiscord, FaInstagram, FaMediumM } from 'react-icons/fa';

// Footer component
const Footer = () => {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>Galerie</h4>
          <p>The ultimate NFT marketplace on Stellar.</p>
          <div className="social-icons">
            <a href="#" className="social-icon"><FaTwitter /></a>
            <a href="#" className="social-icon"><FaDiscord /></a>
            <a href="#" className="social-icon"><FaInstagram /></a>
            <a href="#" className="social-icon"><FaMediumM /></a>
          </div>
        </div>
        
        <div className="footer-section">
          <h4>Marketplace</h4>
          <ul className="footer-links">
            <li><a href="/">All NFTs</a></li>
            <li><a href="/create">Create</a></li>
            <li><a href="/my-listed-items">My Listings</a></li>
            <li><a href="/my-purchases">My Purchases</a></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Resources</h4>
          <ul className="footer-links">
            <li><a href="#">Help Center</a></li>
            <li><a href="#">Platform Status</a></li>
            <li><a href="#">Partners</a></li>
            <li><a href="#">Blog</a></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Company</h4>
          <ul className="footer-links">
            <li><a href="#">About</a></li>
            <li><a href="#">Careers</a></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} Galerie. All rights reserved.</p>
      </div>
    </footer>
  );
};

function App() {
  return (
    <WalletConnectProvider>
      <BrowserRouter>
        <div className="App">
          <Navigation />

          <div className="content-container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<Create />} />
              <Route path="/my-listed-items" element={<MyListedItems />} />
              <Route path="/my-purchases" element={<MyPurchases />} />
              <Route path="/stellar-setup" element={
                <div className="section">
                  <WalletConnectConnection />
                  <div className="mt-4">
                    <StellarSetup />
                  </div>
                </div>
              } />
            </Routes>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </WalletConnectProvider>
  );
}

export default App;
