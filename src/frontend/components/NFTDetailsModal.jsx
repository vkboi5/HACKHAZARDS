import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { FaHeart, FaShareAlt } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import * as StellarSdk from '@stellar/stellar-sdk';
import useUnifiedWallet from '../../hooks/useUnifiedWallet';
import './ItemDetailsModal.css';

const NFTDetailsModal = ({ 
  show, 
  onHide, 
  item, 
  onBuy,
  onBid
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  
  // Use the unified wallet hook for combined wallet state
  const {
    isConnected,
    publicKey,
    buyWithMoonpay,
    signAndSubmitTransaction
  } = useUnifiedWallet();

  // Price validation helper
  const validatePrice = (price) => {
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      console.error(`Invalid price: ${price || 'undefined'} (must be a positive number)`);
      return false;
    }
    let formattedPrice = parseFloat(price).toFixed(7).replace(/\.?0+$/, '');
    if (!/^\d+(\.\d{1,7})?$/.test(formattedPrice)) {
      console.error(`Price has too many decimal places: ${formattedPrice} (max 7)`);
      return false;
    }
    return formattedPrice;
  };

  // Handle buying with XLM
  const handleBuy = async () => {
    if (!isConnected || !publicKey) {
      toast.error('Please connect your wallet first', { position: 'top-center' });
      return;
    }

    if (onBuy) {
      try {
        setIsLoading(true);
        await onBuy(item);
      } catch (error) {
        setError(`Failed to buy NFT: ${error.message}`);
        toast.error(`Failed to buy NFT: ${error.message}`, { position: 'top-center' });
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle buying with card via MoonPay
  const handleBuyWithCard = async () => {
    if (!isConnected || !publicKey) {
      toast.error('Please connect your wallet first', { position: 'top-center' });
      return;
    }
    
    try {
      setIsLoading(true);
      console.log("Initiating MoonPay purchase for:", item.name);
      await buyWithMoonpay(item.id, item.price);
      toast.success('Purchase initiated!', { position: 'top-center' });
      onHide(); // Close modal after initiating purchase
    } catch (error) {
      console.error('Error buying with MoonPay:', error);
      setError(`Failed to buy with card: ${error.message}`);
      toast.error('Failed to initiate purchase. Please try again.', { position: 'top-center' });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle bid submission
  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (!isConnected) {
      toast.error('Please connect your wallet first', { position: 'top-center' });
      return;
    }
    
    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      toast.error('Please enter a valid bid amount', { position: 'top-center' });
      return;
    }
    
    if (onBid) {
      onBid(bidAmount);
      setBidAmount('');
    }
  };
  
  // Handle social sharing
  const handleShare = (platform) => {
    const url = window.location.origin + '/item/' + item.id;
    const text = `Check out this amazing NFT: ${item.name} on Galerie NFT Marketplace!`;
    
    let shareUrl;
    
    switch(platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      default:
        shareUrl = url;
    }
    
    window.open(shareUrl, '_blank');
  };
  
  if (!item) return null;
  
  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
      className="nft-details-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>NFT Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="nft-modal-content">
          <div className="nft-modal-image">
            <img src={item.image} alt={item.name} />
          </div>
          <div className="nft-modal-info">
            <h3>{item.name}</h3>
            <p className="nft-description">{item.description}</p>
            
            <div className="nft-details-row">
              <span className="detail-label">Creator:</span>
              <span className="detail-value">{item.creator ? item.creator.slice(0, 6) + '...' + item.creator.slice(-4) : 'Unknown'}</span>
            </div>
            
            <div className="nft-details-row">
              <span className="detail-label">Price:</span>
              <span className="detail-value price">{item.price || '0'} XLM</span>
            </div>
            
            {error && (
              <div className="alert alert-danger mt-3">
                {error}
              </div>
            )}
            
            <div className="nft-actions">
              {/* Buy with XLM button */}
              <Button
                variant="success"
                onClick={handleBuy}
                disabled={isLoading || !isConnected}
                className="buy-button mb-3"
              >
                {isLoading ? 'Buying...' : `Buy for ${item.price} XLM`}
              </Button>
              
              {/* Buy with card button */}
              <Button
                variant="primary"
                onClick={handleBuyWithCard}
                disabled={isLoading || !isConnected}
                className="buy-button mb-3"
              >
                {isLoading ? 'Processing...' : 'Buy with Card'}
              </Button>
              
              {/* Bid form */}
              <Form onSubmit={handleBidSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Place a bid (XLM)</Form.Label>
                  <Form.Control
                    type="number"
                    placeholder="Enter bid amount"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    min="0"
                    step="0.001"
                  />
                </Form.Group>
                <Button 
                  variant="primary" 
                  type="submit" 
                  className="bid-button"
                  disabled={!isConnected}
                >
                  Place Bid
                </Button>
              </Form>
              
              {/* Share buttons */}
              <div className="additional-actions">
                <Button 
                  variant="outline-primary" 
                  className="action-button"
                  onClick={() => handleShare('twitter')}
                >
                  <FaShareAlt /> Share
                </Button>
                <Button 
                  variant="outline-danger" 
                  className="action-button"
                >
                  <FaHeart /> {item.likes || 0}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default NFTDetailsModal; 