import React from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from './Navbar';
import Home from './Home.js';
import Create from './Create.js';
import MyListedItems from './MyListedItems.js';
import MyPurchases from './MyPurchases.js';
import './App.css';
// Security alert component
import SecurityAlert from './SecurityAlert';

// Stellar imports
import { StellarWalletProvider } from './StellarWalletProvider';
import { StellarWalletConnection } from './StellarWalletConnection';
import StellarSetup from './StellarSetup';

function App() {
  return (
    <StellarWalletProvider>
      <BrowserRouter>
        <div className="App">
          <Navigation />
          <SecurityAlert />
          <div className="content-container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<Create />} />
              <Route path="/my-listed-items" element={<MyListedItems />} />
              <Route path="/my-purchases" element={<MyPurchases />} />
              <Route path="/stellar-setup" element={
                <div className="section">
                  <StellarWalletConnection />
                  <div className="mt-4">
                    <StellarSetup />
                  </div>
                </div>
              } />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </StellarWalletProvider>
  );
}

export default App;
