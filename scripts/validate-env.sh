#!/bin/bash
# Galerie NFT Marketplace - Environment Validation Script
# This script validates environment variables and credentials

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

function check_env_file() {
  echo -e "${GREEN}Checking for .env file...${NC}"
  
  if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo "Please create a .env file by copying .env.example and updating with your credentials"
    return 1
  fi
  
  echo -e "${GREEN}Found .env file${NC}"
  return 0
}

function check_required_env_vars() {
  echo -e "${GREEN}Checking required environment variables...${NC}"
  
  source .env 2>/dev/null
  local missing_vars=()
  
  # Check Pinata variables
  if [ -z "$REACT_APP_PINATA_API_KEY" ]; then
    missing_vars+=("REACT_APP_PINATA_API_KEY")
  fi
  
  if [ -z "$REACT_APP_PINATA_API_SECRET" ]; then
    missing_vars+=("REACT_APP_PINATA_API_SECRET")
  fi
  
  if [ -z "$REACT_APP_IPFS_GATEWAY" ]; then
    missing_vars+=("REACT_APP_IPFS_GATEWAY")
  fi
  
  # Check Stellar variables if feature flag is enabled
  if [ "$REACT_APP_ENABLE_STELLAR" = "true" ]; then
    if [ -z "$REACT_APP_STELLAR_NETWORK" ]; then
      missing_vars+=("REACT_APP_STELLAR_NETWORK")
    fi
    
    if [ -z "$REACT_APP_HORIZON_URL" ]; then
      missing_vars+=("REACT_APP_HORIZON_URL")
    fi
  fi
  
  # Check Ethereum variables if feature flag is enabled
  if [ "$REACT_APP_ENABLE_ETHEREUM" = "true" ]; then
    if [ -z "$REACT_APP_ETHEREUM_NETWORK" ]; then
      missing_vars+=("REACT_APP_ETHEREUM_NETWORK")
    fi
    
    if [ -z "$REACT_APP_INFURA_KEY" ]; then
      missing_vars+=("REACT_APP_INFURA_KEY")
    fi
  fi
  
  if [ ${#missing_vars[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing required environment variables:${NC}"
    for var in "${missing_vars[@]}"; do
      echo "  - $var"
    done
    return 1
  fi
  
  # Check for placeholder values
  local placeholders=()
  
  if [ -n "$REACT_APP_PINATA_API_KEY" ] && { [ "$REACT_APP_PINATA_API_KEY" = "your-pinata-api-key" ] || [ ${#REACT_APP_PINATA_API_KEY} -lt 10 ]; }; then
    placeholders+=("REACT_APP_PINATA_API_KEY (appears to be a placeholder)")
  fi
  
  if [ -n "$REACT_APP_PINATA_API_SECRET" ] && { [ "$REACT_APP_PINATA_API_SECRET" = "your-pinata-api-secret" ] || [ ${#REACT_APP_PINATA_API_SECRET} -lt 20 ]; }; then
    placeholders+=("REACT_APP_PINATA_API_SECRET (appears to be a placeholder)")
  fi
  
  if [ ${#placeholders[@]} -gt 0 ]; then
    echo -e "${YELLOW}WARNING: The following variables have placeholder values:${NC}"
    for var in "${placeholders[@]}"; do
      echo "  - $var"
    done
    echo "Please replace them with actual values from https://app.pinata.cloud/keys"
  fi
  
  echo -e "${GREEN}Environment variables check complete${NC}"
  
  if [ ${#missing_vars[@]} -eq 0 ]; then
    return 0
  else
    return 1
  fi
}

function test_pinata_credentials() {
  echo -e "${GREEN}Testing Pinata API credentials...${NC}"
  
  # Make sure .env file exists
  if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    return 1
  fi
  
  # Load .env file to get Pinata credentials
  source .env 2>/dev/null
  
  if [ -z "$REACT_APP_PINATA_API_KEY" ] || [ -z "$REACT_APP_PINATA_API_SECRET" ]; then
    echo -e "${RED}ERROR: Pinata API credentials not found in .env file!${NC}"
    return 1
  fi
  
  # Test Pinata API credentials with curl
  echo "

