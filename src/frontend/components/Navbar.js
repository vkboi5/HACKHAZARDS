import './Navbar.css';
import { Link } from "react-router-dom";
import { Navbar, Nav, Button, Container, Badge, Dropdown } from 'react-bootstrap';
import { useWallet } from '../../contexts/WalletContext';
import logo from './logo.png';
import { FaWallet, FaSignOutAlt, FaExternalLinkAlt } from 'react-icons/fa';
import React, { useState } from 'react';
import { useWalletConnect } from './WalletConnectProvider';
import { useWeb3Auth } from './Web3AuthProvider';

const Navigation = () => {
    const { 
        publicKey: stellarPublicKey, 
        isConnected: isStellarConnected,
        disconnectWallet: disconnectStellarWallet,
        connectWallet: connectStellarWallet
    } = useWalletConnect();

    const {
        publicKey: web3AuthPublicKey,
        isConnected: isWeb3AuthConnected,
        logout: web3AuthLogout,
        login: web3AuthLogin,
        loading: web3AuthLoading,
        ready: web3AuthReady,
        error: web3AuthError,
        retryInit: retryWeb3AuthInit
    } = useWeb3Auth();

    const formatPublicKey = (key) => {
        if (!key) return '';
        return `${key.slice(0, 4)}...${key.slice(-4)}`;
    };

    const handleLogout = () => {
        if (isStellarConnected) {
            disconnectStellarWallet();
        }
        if (isWeb3AuthConnected) {
            web3AuthLogout();
        }
    };

    const isLoggedIn = isStellarConnected || isWeb3AuthConnected;
    const publicKey = stellarPublicKey || web3AuthPublicKey;

    return (
        <Navbar expand="lg" bg="secondary" variant="dark" className="custom-navbar">
            <Container>
                <Navbar.Brand as={Link} to="/">
                    <img src={logo} width="100" height="40" className="logo-img" alt="Logo" />
                </Navbar.Brand>
                <Navbar.Toggle aria-controls="responsive-navbar-nav" />
                <Navbar.Collapse id="responsive-navbar-nav">
                    <Nav className="me-auto">
                        <Nav.Link as={Link} to="/">Home</Nav.Link>
                        <Nav.Link as={Link} to="/create">Create</Nav.Link>
                        <Nav.Link as={Link} to="/my-listed-items">My Listed Items</Nav.Link>
                        <Nav.Link as={Link} to="/my-purchases">My Purchases</Nav.Link>
                    </Nav>
                </Navbar.Collapse>
                <div className="connect-wallet-wrapper">
                    {isLoggedIn ? (
                        <div className="d-flex align-items-center">
                            <Dropdown>
                                <Dropdown.Toggle variant="outline-light" id="wallet-dropdown" className="wallet-dropdown-toggle">
                                    <FaWallet className="me-2" />
                                    {formatPublicKey(publicKey)}
                                    {isStellarConnected && <Badge bg="primary" className="ms-2">Stellar</Badge>}
                                    {isWeb3AuthConnected && <Badge bg="info" className="ms-2">Web3Auth</Badge>}
                                </Dropdown.Toggle>

                                <Dropdown.Menu>
                                    <Dropdown.Item
                                        href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <FaExternalLinkAlt className="me-2" />
                                        View on Explorer
                                    </Dropdown.Item>
                                    <Dropdown.Divider />
                                    <Dropdown.Item onClick={handleLogout}>
                                        <FaSignOutAlt className="me-2" />
                                        Logout
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown>
                        </div>
                    ) : (
                        <div className="d-flex gap-2 align-items-center">
                            <Button onClick={connectStellarWallet} variant="outline-light" className="connect-wallet-button">
                                <FaWallet className="me-2" />
                                Connect Wallet
                            </Button>
                            <Button 
                                onClick={web3AuthLogin} 
                                variant="outline-info" 
                                className="connect-wallet-button"
                                disabled={web3AuthLoading || !web3AuthReady}
                            >
                                <FaWallet className="me-2" />
                                {web3AuthLoading ? "Loading..." : "Login with Web3Auth"}
                            </Button>
                            {web3AuthError && !web3AuthLoading && (
                                <Button variant="danger" onClick={retryWeb3AuthInit} className="ms-2">
                                    Retry Web3Auth Init
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </Container>
        </Navbar>
    );
}

export default Navigation;