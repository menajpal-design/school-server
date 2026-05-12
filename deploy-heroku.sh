#!/bin/bash

# DRMS Heroku Deployment Script
# This script deploys both server and client to Heroku

set -e  # Exit on error

echo "======================================"
echo "🚀 DRMS Heroku Deployment Script"
echo "======================================"

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI is not installed."
    echo "📥 Install from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check if Git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed."
    exit 1
fi

echo ""
echo "✅ Prerequisites checked"
echo ""

# Check Heroku login
if ! heroku auth:whoami &> /dev/null; then
    echo "⚠️  You are not logged in to Heroku"
    echo "🔐 Logging in..."
    heroku login
fi

echo ""
echo "======================================"
echo "📦 Server Deployment"
echo "======================================"

read -p "Enter server app name (e.g., drms-server): " SERVER_APP_NAME

if [ -z "$SERVER_APP_NAME" ]; then
    echo "❌ App name cannot be empty"
    exit 1
fi

cd server

echo ""
echo "Creating/checking Heroku app: $SERVER_APP_NAME"

# Create app if doesn't exist (will error if exists, but we continue)
heroku create $SERVER_APP_NAME 2>/dev/null || echo "App may already exist"

echo ""
echo "Setting environment variables for server..."

read -p "Enter MongoDB Atlas URI: " MONGO_URI
read -p "Enter JWT Secret (or press Enter for default): " JWT_SECRET

if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET="super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012"
fi

heroku config:set MONGO_URI="$MONGO_URI" -a $SERVER_APP_NAME
heroku config:set JWT_SECRET="$JWT_SECRET" -a $SERVER_APP_NAME
heroku config:set NODE_ENV="production" -a $SERVER_APP_NAME

echo ""
echo "✅ Server config set. Deploying..."

git push heroku main -a $SERVER_APP_NAME 2>/dev/null || echo "Already deployed or error"

echo ""
echo "✅ Server deployed!"

SERVER_URL="https://$SERVER_APP_NAME.herokuapp.com"
echo "Server URL: $SERVER_URL"

echo ""
echo "======================================"
echo "🎨 Client Deployment"
echo "======================================"

cd ../client

read -p "Enter client app name (e.g., drms-client): " CLIENT_APP_NAME

if [ -z "$CLIENT_APP_NAME" ]; then
    echo "❌ App name cannot be empty"
    exit 1
fi

echo ""
echo "Creating/checking Heroku app: $CLIENT_APP_NAME"

heroku create $CLIENT_APP_NAME 2>/dev/null || echo "App may already exist"

echo ""
echo "Setting environment variables for client..."

heroku config:set NEXT_PUBLIC_API_URL="$SERVER_URL/api" -a $CLIENT_APP_NAME

echo ""
echo "✅ Client config set. Deploying..."

git push heroku main -a $CLIENT_APP_NAME 2>/dev/null || echo "Already deployed or error"

echo ""
echo "✅ Client deployed!"

CLIENT_URL="https://$CLIENT_APP_NAME.herokuapp.com"
echo "Client URL: $CLIENT_URL"

echo ""
echo "======================================"
echo "🎉 Deployment Complete!"
echo "======================================"
echo ""
echo "📝 Your deployment URLs:"
echo "  Server: $SERVER_URL"
echo "  Client: $CLIENT_URL"
echo ""
echo "🔐 Update Android app with server URL in:"
echo "  android/src/network/RetrofitClient.kt"
echo "  const val BASE_URL = \"$SERVER_URL/api/\""
echo ""
echo "✅ Next steps:"
echo "  1. Test login at $CLIENT_URL"
echo "  2. Check logs: heroku logs --tail -a $SERVER_APP_NAME"
echo "  3. Check logs: heroku logs --tail -a $CLIENT_APP_NAME"
echo ""
echo "📚 Full guide: Read HEROKU_DEPLOYMENT_GUIDE.md"
echo "======================================"
