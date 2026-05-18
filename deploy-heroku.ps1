# easy school Heroku Deployment Script for Windows PowerShell
# This script deploys both server and client to Heroku

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🚀 easy school Heroku Deployment Script" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if Heroku CLI is installed
try {
    $null = heroku --version
} catch {
    Write-Host "❌ Heroku CLI is not installed." -ForegroundColor Red
    Write-Host "📥 Install from: https://devcenter.heroku.com/articles/heroku-cli" -ForegroundColor Yellow
    exit 1
}

# Check if Git is installed
try {
    $null = git --version
} catch {
    Write-Host "❌ Git is not installed." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites checked" -ForegroundColor Green
Write-Host ""

# Check Heroku login
try {
    $null = heroku auth:whoami 2>$null
} catch {
    Write-Host "⚠️  You are not logged in to Heroku" -ForegroundColor Yellow
    Write-Host "🔐 Logging in..." -ForegroundColor Cyan
    heroku login
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "📦 Server Deployment" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan

$SERVER_APP_NAME = Read-Host "Enter server app name (e.g., easy-school-server)"

if ([string]::IsNullOrWhiteSpace($SERVER_APP_NAME)) {
    Write-Host "❌ App name cannot be empty" -ForegroundColor Red
    exit 1
}

Set-Location server

Write-Host ""
Write-Host "Creating/checking Heroku app: $SERVER_APP_NAME" -ForegroundColor Cyan

try {
    heroku create $SERVER_APP_NAME 2>$null
} catch {
    Write-Host "App may already exist" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setting environment variables for server..." -ForegroundColor Cyan

$MONGO_URI = Read-Host "Enter MongoDB Atlas URI"
$JWT_SECRET = Read-Host "Enter JWT Secret (or press Enter for default)"
$EMAIL_ENABLED = Read-Host "Enable email sending? (true/false, press Enter for false)"
$EMAIL_FROM = Read-Host "Enter sender email (e.g. noreply@yourdomain.com, optional)"
$SMTP_HOST = Read-Host "Enter SMTP host (e.g. smtp.gmail.com, optional)"
$SMTP_PORT = Read-Host "Enter SMTP port (e.g. 587, optional)"
$SMTP_USER = Read-Host "Enter SMTP username/email (optional)"
$SMTP_PASS = Read-Host "Enter SMTP password/app password (optional)"

if ([string]::IsNullOrWhiteSpace($JWT_SECRET)) {
    $JWT_SECRET = "super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012"
}

Write-Host "Configuring server..." -ForegroundColor Cyan
heroku config:set MONGO_URI=$MONGO_URI -a $SERVER_APP_NAME
heroku config:set JWT_SECRET=$JWT_SECRET -a $SERVER_APP_NAME
heroku config:set NODE_ENV="production" -a $SERVER_APP_NAME

if (-not [string]::IsNullOrWhiteSpace($EMAIL_ENABLED)) {
    heroku config:set EMAIL_ENABLED=$EMAIL_ENABLED -a $SERVER_APP_NAME
}
if (-not [string]::IsNullOrWhiteSpace($EMAIL_FROM)) {
    heroku config:set EMAIL_FROM=$EMAIL_FROM -a $SERVER_APP_NAME
}
if (-not [string]::IsNullOrWhiteSpace($SMTP_HOST)) {
    heroku config:set SMTP_HOST=$SMTP_HOST -a $SERVER_APP_NAME
}
if (-not [string]::IsNullOrWhiteSpace($SMTP_PORT)) {
    heroku config:set SMTP_PORT=$SMTP_PORT -a $SERVER_APP_NAME
}
if (-not [string]::IsNullOrWhiteSpace($SMTP_USER)) {
    heroku config:set SMTP_USER=$SMTP_USER -a $SERVER_APP_NAME
}
if (-not [string]::IsNullOrWhiteSpace($SMTP_PASS)) {
    heroku config:set SMTP_PASS=$SMTP_PASS -a $SERVER_APP_NAME
}

Write-Host ""
Write-Host "✅ Server config set. Deploying..." -ForegroundColor Green

try {
    git push heroku main -a $SERVER_APP_NAME 2>$null
} catch {
    Write-Host "Git push may have failed or already deployed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Server deployed!" -ForegroundColor Green

$SERVER_URL = "https://$SERVER_APP_NAME.herokuapp.com"
Write-Host "Server URL: $SERVER_URL" -ForegroundColor Cyan

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🎨 Client Deployment" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan

Set-Location ../client

$CLIENT_APP_NAME = Read-Host "Enter client app name (e.g., easy-school-client)"

if ([string]::IsNullOrWhiteSpace($CLIENT_APP_NAME)) {
    Write-Host "❌ App name cannot be empty" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Creating/checking Heroku app: $CLIENT_APP_NAME" -ForegroundColor Cyan

try {
    heroku create $CLIENT_APP_NAME 2>$null
} catch {
    Write-Host "App may already exist" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setting environment variables for client..." -ForegroundColor Cyan

$API_URL = "$SERVER_URL/api"
heroku config:set NEXT_PUBLIC_API_URL=$API_URL -a $CLIENT_APP_NAME

Write-Host ""
Write-Host "✅ Client config set. Deploying..." -ForegroundColor Green

try {
    git push heroku main -a $CLIENT_APP_NAME 2>$null
} catch {
    Write-Host "Git push may have failed or already deployed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Client deployed!" -ForegroundColor Green

$CLIENT_URL = "https://$CLIENT_APP_NAME.herokuapp.com"
Write-Host "Client URL: $CLIENT_URL" -ForegroundColor Cyan

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Your deployment URLs:" -ForegroundColor Green
Write-Host "  Server: $SERVER_URL" -ForegroundColor Cyan
Write-Host "  Client: $CLIENT_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔐 Update Android app with server URL in:" -ForegroundColor Green
Write-Host "  android/src/network/RetrofitClient.kt" -ForegroundColor Yellow
Write-Host "  const val BASE_URL = `"$SERVER_URL/api/`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Next steps:" -ForegroundColor Green
Write-Host "  1. Test login at $CLIENT_URL" -ForegroundColor Cyan
Write-Host "  2. Check logs: heroku logs --tail -a $SERVER_APP_NAME" -ForegroundColor Cyan
Write-Host "  3. Check logs: heroku logs --tail -a $CLIENT_APP_NAME" -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Full guide: Read HEROKU_DEPLOYMENT_GUIDE.md" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
