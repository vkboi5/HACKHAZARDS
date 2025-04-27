import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col, Badge } from 'react-bootstrap';
import { FaHeart, FaShareAlt, FaTwitter, FaFacebook, FaWhatsapp, FaWallet, FaTag, FaUserCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useWalletConnect } from './WalletConnectProvider';
import * as StellarSdk from '@stellar/stellar-sdk';
import MarketplaceService from './MarketplaceService';
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
  const [showShareOptions, setShowShareOptions] = useState(false);
  const { publicKey, isConnected, signAndSubmitTransaction } = useWalletConnect();

  // Consistent price validation
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
    console.log('Validated price in ItemDetailsModal:', { input: price, output: formattedPrice });
    return formattedPrice;
  };

  const handleBuy = async () => {
    if (!isConnected || !publicKey) {
      toast.error('Please connect your Stellar wallet first!', { position: 'top-center' });
      return;
    }

    const validatedPrice = validatePrice(item.price);
    if (!validatedPrice) {
      toast.error(`Invalid price: ${item.price || 'undefined'} (must be a positive number with at most 7 decimal places)`, { position: 'top-center' });
      return;
    }

    if (!item.assetCode || !/^[a-zA-Z0-9]{1,12}$/.test(item.assetCode)) {
      toast.error(`Invalid asset code: ${item.assetCode || 'undefined'}`, { position: 'top-center' });
      return;
    }

    if (!item.creator || !StellarSdk.StrKey.isValidEd25519PublicKey(item.creator)) {
      toast.error(`Invalid creator public key: ${item.creator || 'undefined'}`, { position: 'top-center' });
      return;
    }

    console.log('ItemDetailsModal buyNFT params:', {
      assetCode: item.assetCode,
      publicKey,
      price: validatedPrice,
      creator: item.creator,
    });

    setIsLoading(true);
    setError(null);

    try {
      console.log('Before buyNFT:', {
        assetCode: item.assetCode,
        price: validatedPrice,
        priceType: typeof validatedPrice,
        priceValue: JSON.stringify(validatedPrice),
        creator: item.creator,
      });
      await MarketplaceService.buyNFT(
        item.assetCode,
        publicKey,
        validatedPrice,
        item.creator,
        signAndSubmitTransaction
      );
      toast.success(`Successfully purchased ${item.name} for ${validatedPrice} XLM!`, {
        position: 'top-center',
      });
      onHide(); // Close modal after purchase
    } catch (error) {
      const errorMessage = `Failed to buy NFT: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage, { position: 'top-center' });
    } finally {
      setIsLoading(false);
    }
  };

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
    setShowShareOptions(false);
  };

  const formatAddress = (address) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
            
            <div className="nft-details-row">
              <div className="creator-badge">
                <FaUserCircle size={20} style={{ marginRight: '8px', color: '#4637B8' }} />
                <span className="detail-label">Creator:</span>
                <span className="detail-value" style={{ marginLeft: '8px' }}>{formatAddress(item.creator)}</span>
              </div>
              {item.type && (
                <Badge 
                  bg={item.type === 'fixed_price' ? 'primary' : item.type === 'open_bid' ? 'info' : 'secondary'}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  {item.type === 'fixed_price' ? 'Fixed Price' : item.type === 'open_bid' ? 'Open for Bids' : 'Auction'}
                </Badge>
              )}
            </div>
            
            <p className="nft-description">{item.description}</p>
            
            <div className="nft-details-row">
              <div className="d-flex align-items-center">
                <FaTag size={16} style={{ marginRight: '8px', color: '#4637B8' }} />
                <span className="detail-label">Price:</span>
              </div>
              <span className="detail-value price">{item.price || '0'} XLM</span>
            </div>
            
            <div className="nft-details-row">
              <div className="d-flex align-items-center">
                <FaWallet size={16} style={{ marginRight: '8px', color: '#4637B8' }} />
                <span className="detail-label">Asset Code:</span>
              </div>
              <span className="detail-value">{item.assetCode || 'N/A'}</span>
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
            
            {error && (
              <div className="alert alert-danger mt-3">
                {error}
              </div>
            )}
            
            <div className="nft-actions">
              <Button
                variant="success"
                onClick={handleBuy}
                disabled={isLoading || !isConnected || !validatePrice(item.price) || !item.assetCode || !item.creator || !StellarSdk.StrKey.isValidEd25519PublicKey(item.creator)}
                className="buy-button"
              >
                {isLoading ? 'Processing...' : `Buy for ${item.price} XLM`}
              </Button>
              
              {item.type === 'open_bid' && (
                <Form onSubmit={handleBidSubmit} className="bid-form">
                  <Form.Group className="mb-3">
                    <Form.Label>Place a bid (XLM)</Form.Label>
                    <Form.Control
                      type="number"
                      placeholder="Enter bid amount"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      required
                      min="0.0000001"
                      step="0.0000001"
                    />
                  </Form.Group>
                  <div className="d-grid">
                    <Button variant="primary" type="submit" disabled={!isConnected}>
                      Place Bid
                    </Button>
                  </div>
                </Form>
              )}
              
              <div className="additional-actions">
                <Button 
                  variant="outline-primary" 
                  className="action-button"
                  onClick={() => setShowShareOptions(!showShareOptions)}
                >
                  <FaShareAlt /> Share
                </Button>
                <Button 
                  variant="outline-danger" 
                  className="action-button"
                >
                  <FaHeart /> Add to Favorites
                </Button>
              </div>
              
              {showShareOptions && (
                <div className="share-options">
                  <button onClick={() => handleShare('twitter')} className="share-button twitter">
                    <FaTwitter />
                  </button>
                  <button onClick={() => handleShare('facebook')} className="share-button facebook">
                    <FaFacebook />
                  </button>
                  <button onClick={() => handleShare('whatsapp')} className="share-button whatsapp">
                    <FaWhatsapp />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}

export default ItemDetailsModal;