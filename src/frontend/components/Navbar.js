import './Navbar.css';
import { Link } from "react-router-dom";
import { Navbar, Nav, Button, Container, Badge, Dropdown } from 'react-bootstrap';
import { useWalletConnect } from './WalletConnectProvider';
import logo from './logo.png';
import { FaWallet, FaSignOutAlt, FaExternalLinkAlt } from 'react-icons/fa';
import React, { useState } from 'react';

const Navigation = () => {
    const [showLinks, setShowLinks] = useState(false);
    
    const {
        publicKey,
        isConnected,
        connectWallet,
        disconnectWallet,
        balanceInXLM,
        walletMethod
    } = useWalletConnect();

    const formatBalance = (balance) => {
        // Format to 2 decimal places
        return parseFloat(balance).toFixed(2);
    };

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
                        <Nav.Link as={Link} to="/stellar-setup">Stellar Setup</Nav.Link>
                    </Nav>
                </Navbar.Collapse>
                <div className="connect-wallet-wrapper">
                    {isConnected ? (
                        <div className="d-flex align-items-center">
                            <div className="wallet-balance me-3">
                                <Badge bg="light" text="dark" className="balance-badge">
                                    {formatBalance(balanceInXLM)} XLM
                                </Badge>
                            </div>
                            <Dropdown>
                                <Dropdown.Toggle variant="outline-light" id="wallet-dropdown" className="wallet-dropdown-toggle">
                                    <FaWallet className="me-2" />
                                    {publicKey.slice(0, 5) + '...' + publicKey.slice(-5)}
                                    {walletMethod === 'walletconnect' && (
                                        <Badge bg="info" className="ms-2">WalletConnect</Badge>
                                    )}
                                    {walletMethod === 'manual' && (
                                        <Badge bg="secondary" className="ms-2">Manual</Badge>
                                    )}
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
                                    <Dropdown.Item onClick={disconnectWallet}>
                                        <FaSignOutAlt className="me-2" />
                                        Disconnect Wallet
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown>
                        </div>
                    ) : (
                        <Button onClick={connectWallet} variant="outline-light" className="connect-wallet-button">
                            <FaWallet className="me-2" />
                            Connect Wallet
                        </Button>
                    )}
                </div>
            </Container>
        </Navbar>
    );
}

export default Navigation;