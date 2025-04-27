import React from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from './Navbar';
import Home from './Home.js';
import Create from './Create.js';
import MyListedItems from './MyListedItems.js';
import MyPurchases from './MyPurchases.js';
import { WalletConnection } from './WalletConnection';
import './App.css';
// Security alert component
import SecurityAlert from './SecurityAlert';
import { WalletProvider } from '../../contexts/WalletContext';
import { WalletConnectProvider } from './WalletConnectProvider';
import { Web3AuthProvider } from './Web3AuthProvider';

function App() {
  return (
    <WalletProvider>
      <WalletConnectProvider>
        <Web3AuthProvider>
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
                  <Route path="/connect" element={<WalletConnection />} />
                </Routes>
              </div>
            </div>
          </BrowserRouter>
        </Web3AuthProvider>
      </WalletConnectProvider>
    </WalletProvider>
  );
}

export default App;
