# easy school - Setup and Run Script
# This script installs all dependencies and starts all services

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Check-MongoDB {
    Write-Status "Checking MongoDB Connection..."
    try {
        $connection = mongosh --eval "db.adminCommand('ping')" 2>&1
        if ($connection -like "*{ ok: 1 }*" -or $connection -like "*1*") {
            Write-Host "✓ MongoDB is running" -ForegroundColor Green
            return $true
        }
    }
    catch {
        Write-Host "✗ MongoDB is not running or not installed" -ForegroundColor Yellow
        Write-Host "Please start MongoDB and try again" -ForegroundColor Yellow
        return $false
    }
}

function Install-Dependencies {
    param([string]$ProjectPath, [string]$ProjectName)
    
    Write-Status "Installing $ProjectName dependencies..."
    
    $npmPath = Join-Path $ProjectPath "package.json"
    if (Test-Path $npmPath) {
        Push-Location $ProjectPath
        
        # Remove old node_modules and package-lock to avoid conflicts
        if (Test-Path "node_modules") {
            Write-Host "Cleaning old node_modules..." -ForegroundColor Yellow
            Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
        }
        
        npm install --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) {
            Write-Host "✗ Failed to install $ProjectName dependencies" -ForegroundColor Red
            Pop-Location
            return $false
        }
        
        Write-Host "✓ $ProjectName dependencies installed" -ForegroundColor Green
        Pop-Location
        return $true
    }
    else {
        Write-Host "✗ package.json not found in $ProjectPath" -ForegroundColor Red
        return $false
    }
}

function Create-Env-File {
    param([string]$ProjectPath, [string]$Content)
    
    $envPath = Join-Path $ProjectPath ".env"
    if (-not (Test-Path $envPath)) {
        Write-Host "Creating .env file..." -ForegroundColor Yellow
        $Content | Out-File -FilePath $envPath -Encoding UTF8
        Write-Host "✓ .env file created" -ForegroundColor Green
    }
    else {
        Write-Host "✓ .env file already exists" -ForegroundColor Green
    }
}

# Main script
Write-Host "easy school - School Management System Setup" -ForegroundColor Cyan -BackgroundColor Black
Write-Host "=====================================" -ForegroundColor Cyan

$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $rootPath "server"
$clientPath = Join-Path $rootPath "client"
$androidPath = Join-Path $rootPath "android"

Write-Host "Root Path: $rootPath" -ForegroundColor Gray

# Check MongoDB
if (-not (Check-MongoDB)) {
    Write-Host "`nPlease install and start MongoDB before continuing." -ForegroundColor Red
    exit 1
}

# Create server .env
$serverEnv = @"
PORT=5000
MONGO_URI=mongodb://localhost:27017/easy_school
MONGO_DB_NAME=easy_school
JWT_SECRET=super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012
NODE_ENV=development
EMAIL_ENABLED=false
FRONTEND_URL=http://localhost:3000
MOBILE_URL=http://localhost:8081
"@

Create-Env-File $serverPath $serverEnv

# Install all dependencies
$allSuccess = $true

if (-not (Install-Dependencies $serverPath "Server")) {
    $allSuccess = $false
}

if (-not (Install-Dependencies $clientPath "Client")) {
    $allSuccess = $false
}

if (-not (Install-Dependencies $androidPath "Android")) {
    $allSuccess = $false
}

if (-not $allSuccess) {
    Write-Host "`n✗ Some installations failed. Please check the errors above." -ForegroundColor Red
    exit 1
}

# Seed the database
Write-Status "Seeding Database..."
Push-Location $serverPath
npm run seed
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database seeded successfully" -ForegroundColor Green
    Write-Host "Demo user: head@demoschool.edu / admin123" -ForegroundColor Green
}
else {
    Write-Host "✗ Database seeding failed (this may be okay if already seeded)" -ForegroundColor Yellow
}
Pop-Location

# Success message
Write-Status "Setup Complete!"
Write-Host @"
All dependencies are installed. You can now start the services.

Next Steps:
===========

1. Start Server (in new terminal):
   cd server
   npm run dev
   
   Server will run at: http://localhost:5000

2. Start Web Client (in new terminal):
   cd client
   npm run dev
   
   Web client will run at: http://localhost:3000

3. Start Mobile App (in new terminal):
   cd android
   npx expo start -c
   
   Press 'a' for Android Emulator
   Press 'w' for Web
   Scan QR code with Expo Go app

Demo Credentials:
==================
Email: head@demoschool.edu
Password: admin123

More info in QUICK_START.md
"@ -ForegroundColor Green

exit 0
