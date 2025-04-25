import React from 'react';
import { Card, Button, Alert, Spinner } from 'react-bootstrap';
import { useWeb3Auth } from '../../contexts/Web3AuthContext';

const Web3AuthLogin = () => {
  const {
    isLoggedIn,
    userInfo,
    stellarAccount,
    loading,
    error,
    login,
    logout,
    exportAccount
  } = useWeb3Auth();

  const handleExport = () => {
    if (!stellarAccount) return;
    
    const account = exportAccount();
    
    // Create a download link for the account details
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(account, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "stellar-account.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <h4 className="mb-0">Login with Email/Google</h4>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="text-center">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </div>
        ) : (
          <>
            {isLoggedIn && stellarAccount ? (
              <div>
                <Alert variant="success">Successfully logged in</Alert>
                {userInfo && (
                  <div className="mb-3">
                    <p className="mb-1"><strong>Email:</strong> {userInfo.email}</p>
                    <p className="mb-1"><strong>Name:</strong> {userInfo.name}</p>
                  </div>
                )}
                <div className="mb-3">
                  <h5>Stellar Account</h5>
                  <p className="mb-1"><strong>Public Key:</strong> {stellarAccount.publicKey}</p>
                  {stellarAccount.balances && stellarAccount.balances.length > 0 ? (
                    <div>
                      <h6>Balances:</h6>
                      <ul>
                        {stellarAccount.balances.map((b, index) => (
                          <li key={index}>
                            {b.asset_type === 'native' ? 'XLM' : b.asset_code}: {b.balance}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>No balances available yet.</p>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <Button variant="danger" onClick={logout}>
                    Logout
                  </Button>
                  <Button variant="secondary" onClick={handleExport}>
                    Export Wallet
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-3">
                  Login with your Google account or email to create a Stellar wallet automatically.
                  No crypto knowledge required!
                </p>
                <Button variant="primary" onClick={login}>
                  Login with Email/Google
                </Button>
              </div>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default Web3AuthLogin; 