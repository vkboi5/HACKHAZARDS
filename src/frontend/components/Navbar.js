import './Navbar.css';
import { Link } from "react-router-dom";
import { Navbar, Nav, Button, Container } from 'react-bootstrap';
import { useStellarWallet } from './StellarWalletProvider';
import logo from './logo.png';

const Navigation = () => {
    const { publicKey, isConnected, connectWallet, disconnectWallet } = useStellarWallet();

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
                            <Nav.Link
                                href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="button nav-button btn-sm mx-4">
                                <Button variant="outline-light">
                                    {publicKey.slice(0, 5) + '...' + publicKey.slice(-5)}
                                </Button>
                            </Nav.Link>
                            <Button onClick={disconnectWallet} variant="outline-danger" size="sm">
                                Disconnect
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={connectWallet} variant="outline-light" className="connect-wallet-button">
                            Connect Stellar Wallet
                        </Button>
                    )}
                </div>
            </Container>
        </Navbar>
    );
}

export default Navigation;