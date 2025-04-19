# Galerie NFT Marketplace - Environment Validation Script
# This script validates environment variables and credentials

# Color output for better readability
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    else {
        $input | Write-Output
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Test-EnvFile {
    Write-ColorOutput Green "Checking for .env file..."
    
    if (!(Test-Path ".env")) {
        Write-ColorOutput Red "ERROR: .env file not found!"
        Write-Output "Please create a .env file by copying .env.example and updating with your credentials"
        return $false
    }
    
    Write-ColorOutput Green "Found .env file"
    return $true
}

function Test-RequiredEnvVars {
    Write-ColorOutput Green "Checking required environment variables..."
    
    $missingVars = @()
    
    # Load .env file into memory
    $envFile = Get-Content ".env" -ErrorAction SilentlyContinue
    $envVars = @{}
    
    foreach ($line in $envFile) {
        if ($line -match '^([^#=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            $envVars[$key] = $value
        }
    }
    
    # Check Pinata variables
    if (!$envVars.ContainsKey("REACT_APP_PINATA_API_KEY") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_PINATA_API_KEY"])) {
        $missingVars += "REACT_APP_PINATA_API_KEY"
    }
    
    if (!$envVars.ContainsKey("REACT_APP_PINATA_API_SECRET") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_PINATA_API_SECRET"])) {
        $missingVars += "REACT_APP_PINATA_API_SECRET"
    }
    
    if (!$envVars.ContainsKey("REACT_APP_IPFS_GATEWAY") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_IPFS_GATEWAY"])) {
        $missingVars += "REACT_APP_IPFS_GATEWAY"
    }
    
    # Check Stellar variables if feature flag is enabled
    if ($envVars.ContainsKey("REACT_APP_ENABLE_STELLAR") -and $envVars["REACT_APP_ENABLE_STELLAR"] -eq "true") {
        if (!$envVars.ContainsKey("REACT_APP_STELLAR_NETWORK") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_STELLAR_NETWORK"])) {
            $missingVars += "REACT_APP_STELLAR_NETWORK"
        }
        
        if (!$envVars.ContainsKey("REACT_APP_HORIZON_URL") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_HORIZON_URL"])) {
            $missingVars += "REACT_APP_HORIZON_URL"
        }
    }
    
    # Check Ethereum variables if feature flag is enabled
    if ($envVars.ContainsKey("REACT_APP_ENABLE_ETHEREUM") -and $envVars["REACT_APP_ENABLE_ETHEREUM"] -eq "true") {
        if (!$envVars.ContainsKey("REACT_APP_ETHEREUM_NETWORK") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_ETHEREUM_NETWORK"])) {
            $missingVars += "REACT_APP_ETHEREUM_NETWORK"
        }
        
        if (!$envVars.ContainsKey("REACT_APP_INFURA_KEY") -or [string]::IsNullOrWhiteSpace($envVars["REACT_APP_INFURA_KEY"])) {
            $missingVars += "REACT_APP_INFURA_KEY"
        }
    }
    
    if ($missingVars.Count -gt 0) {
        Write-ColorOutput Red "ERROR: Missing required environment variables:"
        foreach ($var in $missingVars) {
            Write-Output "  - $var"
        }
        return $false
    }
    
    # Check for placeholder values
    $placeholders = @()
    
    if ($envVars.ContainsKey("REACT_APP_PINATA_API_KEY") -and 
        ($envVars["REACT_APP_PINATA_API_KEY"] -eq "your-pinata-api-key" -or 
         $envVars["REACT_APP_PINATA_API_KEY"].Length -lt 10)) {
        $placeholders += "REACT_APP_PINATA_API_KEY (appears to be a placeholder)"
    }
    
    if ($envVars.ContainsKey("REACT_APP_PINATA_API_SECRET") -and 
        ($envVars["REACT_APP_PINATA_API_SECRET"] -eq "your-pinata-api-secret" -or 
         $envVars["REACT_APP_PINATA_API_SECRET"].Length -lt 20)) {
        $placeholders += "REACT_APP_PINATA_API_SECRET (appears to be a placeholder)"
    }
    
    if ($placeholders.Count -gt 0) {
        Write-ColorOutput Yellow "WARNING: The following variables have placeholder values:"
        foreach ($var in $placeholders) {
            Write-Output "  - $var"
        }
        Write-Output "Please replace them with actual values from https://app.pinata.cloud/keys"
    }
    
    Write-ColorOutput Green "Environment variables check complete"
    
    if ($missingVars.Count -eq 0) {
        return $true
    } else {
        return $false
    }
}

function Test-PinataCredentials {
    Write-ColorOutput Green "Testing Pinata API credentials..."
    
    # Load .env file if it exists
    if (!(Test-Path ".env")) {
        Write-ColorOutput Red "ERROR: .env file not found!"
        return $false
    }
    
    # Extract Pinata credentials
    $envFile = Get-Content ".env" -ErrorAction SilentlyContinue
    $pinataApiKey = ""
    $pinataApiSecret = ""
    
    foreach ($line in $envFile) {
        if ($line -match '^REACT_APP_PINATA_API_KEY=(.*)$') {
            $pinataApiKey = $matches[1].Trim().Trim('"').Trim("'")
        }
        if ($line -match '^REACT_APP_PINATA_API_SECRET=(.*)$') {
            $pinataApiSecret = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    
    if ([string]::IsNullOrWhiteSpace($pinataApiKey) -or [string]::IsNullOrWhiteSpace($pinataApiSecret)) {
        Write-ColorOutput Red "ERROR: Pinata API credentials not found in .env file!"
        return $false
    }
    
    # Test Pinata API credentials
    try {
        $headers = @{
            "pinata_api_key" = $pinataApiKey
            "pinata_secret_api_key" = $pinataApiSecret
        }
        
        $response = Invoke-RestMethod -Uri "https://api.pinata.cloud/data/testAuthentication" -Method Get -Headers $headers
        
        if ($response) {
            Write-ColorOutput Green "SUCCESS: Pinata API credentials are valid!"
            return $true
        } else {
            Write-ColorOutput Red "ERROR: Pinata API validation failed!"
            return $false
        }
    } catch {
        Write-ColorOutput Red "ERROR: Failed to validate Pinata API credentials!"
        Write-Output "Error details: $_"
        return $false
    }
}

function Show-CredentialRotationReminder {
    Write-ColorOutput Yellow "SECURITY REMINDER: Credential Rotation Best Practices"
    Write-Output "It's recommended to rotate your credentials periodically:"
    Write-Output "  - Pinata API Keys: Every 60-90 days"
    Write-Output "  - Ethereum Private Keys: After any suspected compromise"
    Write-Output "  - Stellar Secret Keys: After any suspected compromise"
    Write-Output "  - Infura API Keys: Every 90 days"
    Write-Output ""
    Write-Output "For instructions on rotating credentials, see SECURITY.md"
}

# Main execution
Write-ColorOutput Cyan "================================================================="
Write-ColorOutput Cyan "Galerie NFT Marketplace - Environment Validation Tool"
Write-ColorOutput Cyan "================================================================="

$envFileExists = Test-EnvFile
if (!$envFileExists) {
    exit 1
}

$envVarsValid = Test-RequiredEnvVars
if (!$envVarsValid) {
    Write-ColorOutput Yellow "Please fix the missing environment variables before continuing."
}

$pinataCredentialsValid = Test-PinataCredentials
if (!$pinataCredentialsValid) {
    Write-ColorOutput Yellow "Please check your Pinata credentials at https://app.pinata.cloud/keys"
    Write-ColorOutput Yellow "Update your .env file with valid credentials and try again."
}

Show-CredentialRotationReminder

Write-ColorOutput Cyan "================================================================="
if ($envVarsValid -and $pinataCredentialsValid) {
    Write-ColorOutput Green "All checks passed! Your environment is properly configured."
} else {
    Write-ColorOutput Yellow "Some checks failed. Please address the issues above."
}
Write-ColorOutput Cyan "================================================================="

