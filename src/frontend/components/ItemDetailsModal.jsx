import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { FaHeart, FaShareAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useWalletConnect } from './WalletConnectProvider';
import { useWallet } from '../../contexts/WalletContext';
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
  
  // Get wallet state from both providers
  const { publicKey: walletConnectKey, isConnected: isWalletConnected, signAndSubmitTransaction } = useWalletConnect();
  const { publicKey: web3AuthKey, isLoggedIn: isWeb3AuthLoggedIn, buyWithMoonpay } = useWallet();
  
  // Combined wallet state - use either connection
  const isConnected = isWalletConnected || isWeb3AuthLoggedIn;
  const publicKey = walletConnectKey || web3AuthKey;

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
      toast.error('Please connect your wallet first!', { position: 'top-center' });
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

  const handleBuyWithCard = async () => {
    if (!isWeb3AuthLoggedIn && !isWalletConnected) {
      toast.error('Please connect your wallet first!', { position: 'top-center' });
      return;
    }
    
    try {
      setIsLoading(true);
      await buyWithMoonpay(item.id, item.price);
      toast.success('Purchase initiated!', { position: 'top-center' });
      onHide(); // Close modal after initiating purchase
    } catch (error) {
      console.error('Error buying with MoonPay:', error);
      toast.error('Failed to initiate purchase. Please try again.', { position: 'top-center' });
      setError(`Failed to buy with card: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (!isConnected) {
      toast.error('Please connect your wallet first!', { position: 'top-center' });
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
              <span className="detail-value">{item.creator ? item.creator.slice(0, 6) + '...' + item.creator.slice(-4) : 'Unknown'}</span>
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
                className="buy-button mb-3"
              >
                {isLoading ? 'Buying...' : `Buy for ${item.price} XLM`}
              </Button>
              
              <Button
                variant="primary"
                onClick={handleBuyWithCard}
                disabled={isLoading || !(isWeb3AuthLoggedIn || isWalletConnected)}
                className="buy-button mb-3"
              >
                {isLoading ? 'Processing...' : 'Buy with Card'}
              </Button>
              
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