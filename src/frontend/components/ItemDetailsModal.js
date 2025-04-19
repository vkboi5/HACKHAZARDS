import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { FaHeart, FaShareAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useWalletConnect } from './WalletConnectProvider';
import './ItemDetailsModal.css';

const ItemDetailsModal = ({ 
  show, 
  onHide, 
  item, 
  onBid, 
  bidAmount, 
  setBidAmount
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { publicKey, isConnected } = useWalletConnect();
  
  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (!isConnected) {
      toast.error('Please connect your Stellar wallet first!', { position: 'top-center' });
      return;
    }
    
    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      toast.error('Please enter a valid bid amount', { position: 'top-center' });
      return;
    }
    
    onBid(bidAmount);
  };
  
  const handleShare = (platform) => {
    const url = window.location.origin + '/item/' + item.itemId;
    const text = `Check out this amazing NFT: ${item.name} on Galerie NFT Marketplace!`;
    
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
              <span className="detail-value">{item.seller ? item.seller.slice(0, 6) + '...' + item.seller.slice(-4) : 'Unknown'}</span>
            </div>
            
            <div className="nft-details-row">
              <span className="detail-label">Price:</span>
              <span className="detail-value price">{item.price || '0'} XLM</span>
            </div>
            
            {item.attributes && item.attributes.length > 0 && (
              <div className="nft-attributes">
                <h4>Attributes</h4>
                <div className="attributes-grid">
                  {item.attributes.map((attr, idx) => (
                    <div key={idx} className="attribute-item">
                      <span className="attribute-trait">{attr.trait_type}</span>
                      <span className="attribute-value">{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="nft-actions">
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
                <Button variant="primary" type="submit" className="bid-button">
                  Place Bid
                </Button>
              </Form>
              
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

export default ItemDetailsModal; 