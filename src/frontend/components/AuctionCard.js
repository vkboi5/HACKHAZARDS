import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Row, Col, Form, Spinner, Modal } from 'react-bootstrap';
import { useWalletConnect } from './WalletConnectProvider';
import { toast } from 'react-hot-toast';
import BidService from './BidService';
import AuctionService from './AuctionService';

const AuctionCard = ({ nft, onBidPlaced, refreshNFTs }) => {
  const { publicKey, isConnected, signAndSubmitTransaction } = useWalletConnect();
  const [bidAmount, setBidAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [bids, setBids] = useState([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [highestBid, setHighestBid] = useState(null);

  useEffect(() => {
    setIsOwner(publicKey === nft.creator);
    fetchBids();
    checkAuctionStatus();

    // Set up timer to update time remaining
    const timer = setInterval(() => {
      updateTimeRemaining();
    }, 1000);

    return () => clearInterval(timer);
  }, [nft, publicKey]);

  const fetchBids = async () => {
    try {
      setLoading(true);
      const bidsList = await BidService.getBidsForNFT(nft.assetCode, nft.creator);
      setBids(bidsList);
      
      // Set highest bid
      if (bidsList.length > 0) {
        setHighestBid(bidsList[0]);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bids:', error);
      setLoading(false);
    }
  };

  const checkAuctionStatus = async () => {
    if (nft.type === 'timed_auction') {
      try {
        // Check if auction has auction info
        const auctionDetails = await AuctionService.getAuctionDetails(nft.assetCode, nft.creator);
        if (auctionDetails && auctionDetails.endTime) {
          const endTime = new Date(auctionDetails.endTime);
          const now = new Date();
          
          if (endTime <= now) {
            setAuctionEnded(true);
          } else {
            updateTimeRemaining(endTime);
          }
        }
      } catch (error) {
        console.error('Error checking auction status:', error);
      }
    }
  };

  const updateTimeRemaining = (endTimeDate) => {
    if (nft.type === 'timed_auction') {
      try {
        const endTime = endTimeDate || new Date(nft.endTime);
        const now = new Date();
        
        if (endTime <= now) {
          setAuctionEnded(true);
          setTimeRemaining(null);
          return;
        }
        
        const diff = endTime.getTime() - now.getTime();
        
        // Format time remaining
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        let timeString = '';
        if (days > 0) timeString += `${days}d `;
        if (hours > 0 || days > 0) timeString += `${hours}h `;
        if (minutes > 0 || hours > 0 || days > 0) timeString += `${minutes}m `;
        timeString += `${seconds}s`;
        
        setTimeRemaining(timeString);
      } catch (error) {
        console.error('Error updating time remaining:', error);
      }
    }
  };

  const handleBid = async () => {
    try {
      if (!isConnected) {
        toast.error('Please connect your wallet first');
        return;
      }
      
      if (!bidAmount || isNaN(parseFloat(bidAmount)) || parseFloat(bidAmount) <= 0) {
        toast.error('Please enter a valid bid amount');
        return;
      }
      
      if (nft.type === 'open_bid' && nft.minimumBid && parseFloat(bidAmount) < parseFloat(nft.minimumBid)) {
        toast.error(`Bid must be at least ${nft.minimumBid} XLM`);
        return;
      }
      
      if (highestBid && parseFloat(bidAmount) <= parseFloat(highestBid.bidAmount)) {
        toast.error(`Bid must be higher than the current highest bid (${highestBid.bidAmount} XLM)`);
        return;
      }
      
      setLoading(true);
      
      // Place bid
      const result = await BidService.placeBid(
        nft.assetCode,
        nft.creator,
        publicKey,
        bidAmount,
        signAndSubmitTransaction
      );
      
      toast.success('Bid placed successfully!');
      setBidAmount('');
      
      // Refresh bids
      await fetchBids();
      
      // Notify parent component
      if (onBidPlaced) {
        onBidPlaced(nft, bidAmount);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error placing bid:', error);
      toast.error(error.message || 'Failed to place bid');
      setLoading(false);
    }
  };

  const handleAcceptBid = async (bid) => {
    try {
      if (!isConnected) {
        toast.error('Please connect your wallet first');
        return;
      }
      
      if (!isOwner) {
        toast.error('Only the NFT owner can accept bids');
        return;
      }
      
      setLoading(true);
      
      // Accept bid
      const result = await BidService.acceptBid(
        nft.assetCode,
        publicKey,
        bid.bidderPublicKey,
        bid.bidAmount,
        signAndSubmitTransaction
      );
      
      toast.success('Bid accepted successfully!');
      
      // Refresh NFTs
      if (refreshNFTs) {
        refreshNFTs();
      }
      
      setLoading(false);
      setShowBidsModal(false);
    } catch (error) {
      console.error('Error accepting bid:', error);
      toast.error(error.message || 'Failed to accept bid');
      setLoading(false);
    }
  };

  const handleFinalizeAuction = async () => {
    try {
      if (!isConnected) {
        toast.error('Please connect your wallet first');
        return;
      }
      
      if (!isOwner) {
        toast.error('Only the NFT owner can finalize the auction');
        return;
      }
      
      setLoading(true);
      
      // Finalize auction
      const result = await AuctionService.checkAndFinalizeAuction(
        nft.assetCode,
        publicKey,
        signAndSubmitTransaction
      );
      
      if (result.winner) {
        toast.success(`Auction finalized! NFT sold to ${result.winner.substring(0, 10)}... for ${result.amount} XLM`);
      } else {
        toast.info('Auction finalized with no bids');
      }
      
      // Refresh NFTs
      if (refreshNFTs) {
        refreshNFTs();
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error finalizing auction:', error);
      toast.error(error.message || 'Failed to finalize auction');
      setLoading(false);
    }
  };

  const handleCancelAuction = async () => {
    try {
      if (!isConnected) {
        toast.error('Please connect your wallet first');
        return;
      }
      
      if (!isOwner) {
        toast.error('Only the NFT owner can cancel the auction');
        return;
      }
      
      setLoading(true);
      
      // Cancel auction
      const result = await AuctionService.cancelAuction(
        nft.assetCode,
        publicKey,
        signAndSubmitTransaction
      );
      
      toast.success('Auction cancelled successfully');
      
      // Refresh NFTs
      if (refreshNFTs) {
        refreshNFTs();
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error cancelling auction:', error);
      toast.error(error.message || 'Failed to cancel auction');
      setLoading(false);
    }
  };

  const renderAuctionStatus = () => {
    if (nft.type === 'timed_auction') {
      if (auctionEnded) {
        return <Badge bg="danger">Auction Ended</Badge>;
      } else {
        return (
          <>
            <Badge bg="primary">Timed Auction</Badge>
            {timeRemaining && <div className="time-remaining">Time left: {timeRemaining}</div>}
          </>
        );
      }
    } else if (nft.type === 'open_bid') {
      return <Badge bg="success">Open for Bids</Badge>;
    } else {
      return <Badge bg="secondary">Fixed Price</Badge>;
    }
  };

  return (
    <Card className="mb-4 auction-card">
      <Card.Img variant="top" src={nft.image} alt={nft.name} className="card-img-top" />
      <Card.Body>
        <Card.Title>{nft.name}</Card.Title>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div>
            {renderAuctionStatus()}
          </div>
          <div>
            <small className="text-muted">Asset: {nft.assetCode}</small>
          </div>
        </div>
        <Card.Text className="mb-2">{nft.description}</Card.Text>
        
        {nft.type === 'fixed_price' && (
          <div className="price-tag">Price: {nft.price} XLM</div>
        )}
        
        {nft.type === 'open_bid' && (
          <div className="price-tag">Minimum Bid: {nft.minimumBid} XLM</div>
        )}
        
        {nft.type === 'timed_auction' && (
          <div className="price-tag">Starting Price: {nft.startingPrice || nft.price} XLM</div>
        )}
        
        {highestBid && (
          <div className="highest-bid mt-2">
            Highest Bid: {highestBid.bidAmount} XLM
            <br />
            <small className="text-muted">
              by: {highestBid.bidderPublicKey.substring(0, 8)}...
            </small>
          </div>
        )}

        {!isOwner && (nft.type === 'open_bid' || (nft.type === 'timed_auction' && !auctionEnded)) && (
          <div className="bid-form mt-3">
            <Form.Group>
              <Form.Label>Your Bid (XLM)</Form.Label>
              <Row>
                <Col xs={8}>
                  <Form.Control
                    type="number"
                    placeholder="Enter bid amount"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    disabled={loading}
                    min={nft.minimumBid || "0.0000001"}
                    step="0.0000001"
                  />
                </Col>
                <Col xs={4}>
                  <Button 
                    variant="primary" 
                    onClick={handleBid} 
                    disabled={loading || !isConnected}
                    className="w-100"
                  >
                    {loading ? <Spinner animation="border" size="sm" /> : 'Bid'}
                  </Button>
                </Col>
              </Row>
            </Form.Group>
          </div>
        )}

        <div className="d-flex justify-content-between mt-3">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => setShowBidsModal(true)}
            disabled={loading}
          >
            View Bids ({bids.length})
          </Button>
          
          {isOwner && (
            <>
              {nft.type === 'open_bid' && bids.length > 0 && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleAcceptBid(bids[0])}
                  disabled={loading}
                >
                  Accept Highest Bid
                </Button>
              )}
              
              {nft.type === 'timed_auction' && auctionEnded && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFinalizeAuction}
                  disabled={loading}
                >
                  Finalize Auction
                </Button>
              )}
              
              {nft.type === 'timed_auction' && !auctionEnded && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleCancelAuction}
                  disabled={loading}
                >
                  Cancel Auction
                </Button>
              )}
            </>
          )}
        </div>
      </Card.Body>

      {/* Bids Modal */}
      <Modal show={showBidsModal} onHide={() => setShowBidsModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Bids for {nft.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loading ? (
            <div className="text-center p-4">
              <Spinner animation="border" />
              <p>Loading bids...</p>
            </div>
          ) : bids.length === 0 ? (
            <p className="text-center">No bids yet</p>
          ) : (
            <div className="bids-list">
              {bids.map((bid, index) => (
                <div key={bid.id} className="bid-item p-2 mb-2 border-bottom">
                  <div className="d-flex justify-content-between">
                    <div>
                      <div>Bid: {bid.bidAmount} XLM</div>
                      <small className="text-muted">
                        From: {bid.bidderPublicKey.substring(0, 10)}...
                      </small>
                      {bid.timestamp && (
                        <small className="d-block text-muted">
                          {new Date(bid.timestamp).toLocaleString()}
                        </small>
                      )}
                    </div>
                    {isOwner && (
                      <Button 
                        variant="outline-success" 
                        size="sm"
                        onClick={() => handleAcceptBid(bid)}
                        disabled={loading}
                      >
                        Accept
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowBidsModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
};

export default AuctionCard; 