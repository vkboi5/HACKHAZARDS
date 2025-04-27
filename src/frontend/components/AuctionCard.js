import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Row, Col, Form, Spinner, Modal } from 'react-bootstrap';
import { useWalletConnect } from './WalletConnectProvider';
import { toast } from 'react-hot-toast';
import BidService from './BidService';
import AuctionService from './AuctionService';
import { FaGavel, FaTimes, FaListUl, FaCheck, FaRegClock, FaUserCircle, FaHeart, FaShareAlt, FaEthereum, FaTwitter, FaFacebook, FaWhatsapp, FaCopy } from 'react-icons/fa';

const AuctionCard = ({ nft, onBidPlaced, refreshNFTs }) => {
  const { publicKey, isConnected, signAndSubmitTransaction } = useWalletConnect();
  const [bidAmount, setBidAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingBids, setLoadingBids] = useState(false);
  const [bids, setBids] = useState([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [highestBid, setHighestBid] = useState(null);
  const [bidError, setBidError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    console.log('AuctionCard received NFT:', nft);
    setIsOwner(publicKey === nft.creator);
    fetchBids();
    checkAuctionStatus();
    
    // Generate random like count for UI enhancement
    setLikeCount(Math.floor(Math.random() * 20));

    // Set up timer to update time remaining
    const timer = setInterval(() => {
      updateTimeRemaining();
    }, 1000);

    return () => clearInterval(timer);
  }, [nft, publicKey]);

  const fetchBids = async () => {
    try {
      setLoadingBids(true);
      console.log(`Fetching bids for NFT: ${nft.assetCode} issued by ${nft.creator}`);
      const bidsList = await BidService.getBidsForNFT(nft.assetCode, nft.creator);
      console.log('Bids received:', bidsList);
      setBids(bidsList);
      
      // Set highest bid
      if (bidsList.length > 0) {
        // Make sure the bid has a bidderPublicKey before setting as highest bid
        if (bidsList[0] && bidsList[0].bidderPublicKey) {
          setHighestBid(bidsList[0]);
        } else {
          console.warn('Highest bid is missing bidderPublicKey, not setting as highest bid', bidsList[0]);
        }
      }
      
      setLoadingBids(false);
    } catch (error) {
      console.error('Error fetching bids:', error);
      toast.error('Failed to load bids. Please try again.');
      setLoadingBids(false);
    }
  };

  const checkAuctionStatus = async () => {
    if (nft.type === 'timed_auction') {
      try {
        // Check if auction has auction info
        const auctionDetails = await AuctionService.getAuctionDetails(nft.assetCode, nft.creator);
        console.log('Auction details:', auctionDetails);
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
      
      if (!bidAmount || parseFloat(bidAmount) <= 0) {
        setBidError('Please enter a valid bid amount');
        toast.error('Please enter a valid bid amount');
        return;
      }
      
      if (nft.type === 'open_bid' && nft.minimumBid && parseFloat(bidAmount) < parseFloat(nft.minimumBid)) {
        setBidError(`Bid must be at least ${nft.minimumBid} XLM`);
        toast.error(`Bid must be at least ${nft.minimumBid} XLM`);
        return;
      }
      
      if (highestBid && parseFloat(bidAmount) <= parseFloat(highestBid.bidAmount)) {
        setBidError(`Bid must be higher than the current highest bid (${highestBid.bidAmount} XLM)`);
        toast.error(`Bid must be higher than the current highest bid (${highestBid.bidAmount} XLM)`);
        return;
      }
      
      setLoading(true);
      
      // Place bid
      console.log('Placing bid with params:', {
        nftAssetCode: nft.assetCode,
        creator: nft.creator,
        bidder: publicKey,
        amount: bidAmount
      });
      
      try {
        const result = await BidService.placeBid(
          nft.assetCode,
          nft.creator,
          publicKey,
          bidAmount,
          signAndSubmitTransaction
        );
        
        console.log('Bid placed successfully:', result);
        toast.success('Bid placed successfully!');
        setBidAmount('');
        
        // Refresh bids
        await fetchBids();
        
        // Notify parent component
        if (onBidPlaced) {
          onBidPlaced(nft, bidAmount);
        }
      } catch (bidError) {
        console.error('Error placing bid:', bidError);
        
        // Check for user cancellation
        if (bidError.message && bidError.message.includes('cancelled by the user')) {
          setBidError('Bid cancelled: You cancelled the transaction in your wallet');
          toast.info('Bid cancelled: You cancelled the transaction in your wallet');
        } else {
          setBidError(bidError.message || 'Failed to place bid');
          toast.error(bidError.message || 'Failed to place bid');
        }
        throw bidError; // Rethrow to be caught by outer catch
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error in bid process:', error);
      setLoading(false);
    }
  };

  const formatAddress = (address) => {
    if (!address) return 'Unknown';
    return address.slice(0, 4) + '...' + address.slice(-4);
  };

  const toggleLike = () => {
    setLiked(!liked);
    setLikeCount(prevCount => liked ? prevCount - 1 : prevCount + 1);
    // In a real app, you would call an API to save the like status
  };

  const handleShare = () => {
    setShowShareModal(true);
  };

  const shareToSocial = (platform) => {
    const url = window.location.href;
    const text = `Check out this amazing NFT: ${nft.name} on Galerie NFT Marketplace!`;
    
    let shareUrl;
    
    switch(platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
        break;
      default:
        shareUrl = url;
    }
    
    window.open(shareUrl, '_blank');
    setShowShareModal(false);
  };

  const handleAcceptBid = async (bid) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!isOwner) {
      toast.error('Only the owner can accept bids');
      return;
    }
    
    try {
      setLoading(true);
      
      console.log('Accepting bid:', bid);
      // Call the service to accept the bid
      await BidService.acceptBid(
        nft.assetCode,
        nft.creator,
        bid.bidderPublicKey,
        bid.bidAmount,
        signAndSubmitTransaction
      );
      
      toast.success('Bid accepted successfully!');
      setShowBidsModal(false);
      
      // Refresh NFTs to update the UI
      if (refreshNFTs) {
        refreshNFTs();
      }
    } catch (error) {
      console.error('Error accepting bid:', error);
      toast.error(error.message || 'Failed to accept bid');
    } finally {
      setLoading(false);
    }
  };

  const renderAuctionStatus = () => {
    if (nft.type === 'fixed_price') {
      return (
        <div className="status-ribbon ribbon-fixed">
          Fixed Price
        </div>
      );
    } else if (nft.type === 'open_bid') {
      return (
        <div className="status-ribbon ribbon-open">
          Open for Bids
        </div>
      );
    } else if (nft.type === 'timed_auction') {
      if (auctionEnded) {
        return (
          <div className="status-ribbon ribbon-ended">
            Auction Ended
          </div>
        );
      } else {
        return (
          <div className="status-ribbon ribbon-timed">
            Timed Auction
          </div>
        );
      }
    }
    return null;
  };

  // Render bid form for non-fixed price NFTs
  const renderBidForm = () => {
    if (nft.type === 'fixed_price') {
      return (
        <Button 
          className="buy-button w-100" 
          disabled={!isConnected || isOwner}
          onClick={() => onBidPlaced(nft, nft.price)}
        >
          Buy Now for {nft.price} XLM
        </Button>
      );
    }
    
    return (
      <>
        <div className="bid-input-container">
          <Form.Control
            type="number"
            placeholder={`Enter bid amount (min. ${nft.minimumBid || highestBid?.bidAmount || 1} XLM)`}
            value={bidAmount}
            onChange={(e) => {
              setBidAmount(e.target.value);
              setBidError(null);
            }}
            disabled={loading || !isConnected || isOwner || auctionEnded}
            className="bid-input mb-2"
          />
          {bidError && <div className="text-danger small mb-2">{bidError}</div>}
          
          <Button
            className="place-bid-button w-100"
            onClick={handleBid}
            disabled={loading || !isConnected || isOwner || auctionEnded}
          >
            {loading ? <Spinner size="sm" animation="border" /> : 'Place Bid'}
          </Button>
        </div>
      </>
    );
  };

  return (
    <Card className="auction-card">
      {renderAuctionStatus()}
      
      <div className="card-img-container">
        <Card.Img 
          variant="top" 
          src={nft.image} 
          alt={nft.name} 
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = 'https://via.placeholder.com/300x300?text=No+Image';
          }}
        />
        
        <div className="card-actions">
          <button className={`like-action ${liked ? 'liked' : ''}`} onClick={toggleLike}>
            <FaHeart />
            <span className="like-count">{likeCount}</span>
          </button>
          <button className="share-action" onClick={handleShare}>
            <FaShareAlt />
          </button>
        </div>
      </div>
      
      <Card.Body>
        <div className="creator-info">
          <div className="creator-avatar">
            <FaUserCircle size={20} color="#4637B8" />
          </div>
          <span className="creator-name">{formatAddress(nft.creator)}</span>
        </div>
        
        <Card.Title>{nft.name}</Card.Title>
        
        <div className="description-text">
          {nft.description}
        </div>
        
        <div className="price-container">
          <div className="price-tag">
            <FaEthereum />
            <div>
              <span className="price-label">Price</span>
              <div className="price-value">{nft.price} XLM</div>
            </div>
          </div>
          
          {highestBid && (
            <div className="highest-bid">
              <FaGavel className="me-2" />
              <div>
                <span className="highest-bid-label">Highest bid</span>
                <div className="highest-bid-value">{highestBid.bidAmount} XLM</div>
              </div>
            </div>
          )}
        </div>
        
        {timeRemaining && (
          <div className="time-remaining">
            <FaRegClock />
            <span>{timeRemaining}</span>
          </div>
        )}
        
        {renderBidForm()}
        
        {bids.length > 0 && (
          <Button 
            variant="outline-primary" 
            size="sm" 
            className="view-bids-button mt-2"
            onClick={() => setShowBidsModal(true)}
          >
            <FaListUl className="me-1" /> View {bids.length} Bids
          </Button>
        )}
      </Card.Body>
      
      {/* Bids Modal */}
      <Modal show={showBidsModal} onHide={() => setShowBidsModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Bids for {nft.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingBids ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
              <p className="mt-3">Loading bids...</p>
            </div>
          ) : bids.length === 0 ? (
            <p className="text-center py-3">No bids placed yet.</p>
          ) : (
            <div className="bids-list">
              {bids.map((bid, index) => (
                <div key={index} className="bid-item">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="bidder-address">
                        <FaUserCircle className="me-2" />
                        {formatAddress(bid.bidderPublicKey)}
                      </div>
                      <div className="bid-date">
                        {new Date(bid.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="bid-amount">
                      {bid.bidAmount} XLM
                    </div>
                  </div>
                  
                  {isOwner && !auctionEnded && index === 0 && (
                    <div className="mt-2">
                      <Button 
                        variant="success" 
                        size="sm" 
                        onClick={() => handleAcceptBid(bid)}
                        className="w-100"
                      >
                        <FaCheck className="me-1" /> Accept Bid
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal>
      
      {/* Share Modal */}
      <Modal show={showShareModal} onHide={() => setShowShareModal(false)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title>Share this NFT</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-center gap-3 py-3">
            <Button variant="outline-primary" onClick={() => shareToSocial('twitter')} className="rounded-circle p-2">
              <FaTwitter size={20} />
            </Button>
            <Button variant="outline-primary" onClick={() => shareToSocial('facebook')} className="rounded-circle p-2">
              <FaFacebook size={20} />
            </Button>
            <Button variant="outline-success" onClick={() => shareToSocial('whatsapp')} className="rounded-circle p-2">
              <FaWhatsapp size={20} />
            </Button>
          </div>
          <div className="mt-3">
            <Form.Control
              type="text"
              value={window.location.href}
              readOnly
              onClick={(e) => e.target.select()}
            />
            <div className="d-grid mt-2">
              <Button 
                variant="outline-secondary" 
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success('Link copied to clipboard!');
                }}
              >
                <FaCopy className="me-2" /> Copy Link
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>
    </Card>
  );
};

export default AuctionCard; 