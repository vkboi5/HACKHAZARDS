import React from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { Button } from 'react-bootstrap';

const LoginButton = () => {
  const { isLoggedIn, login, logout, publicKey } = useWallet();

  return (
    <div className="d-flex align-items-center">
      {isLoggedIn ? (
        <>
          <span className="me-2">
            {publicKey ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}` : 'Connected'}
          </span>
          <Button variant="outline-danger" onClick={logout}>
            Logout
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={login}>
          Login with Google
        </Button>
      )}
    </div>
  );
};

export default LoginButton; 