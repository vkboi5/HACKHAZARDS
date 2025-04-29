import React from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from './Navbar.jsx';
import Home from './Home.jsx';
import Create from './Create.jsx';
import MyListedItems from './MyListedItems.jsx';
import MyPurchases from './MyPurchases.jsx';
import { WalletConnection } from './WalletConnection.jsx';
import './App.css';
// Security alert component
import SecurityAlert from './SecurityAlert.jsx';
import { WalletProvider } from '../../contexts/WalletContext.jsx';
import { WalletConnectProvider } from './WalletConnectProvider.jsx';
import { Web3AuthProvider } from './Web3AuthProvider.jsx';

function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <WalletConnectProvider>
          <Web3AuthProvider>
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
          </Web3AuthProvider>
        </WalletConnectProvider>
      </WalletProvider>
    </BrowserRouter>
  );
}

export default App;
