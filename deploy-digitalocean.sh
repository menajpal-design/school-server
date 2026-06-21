#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Easy School — Digital Ocean Droplet Deploy Script
# Usage: bash deploy-digitalocean.sh
# Run this on the server after SSH-ing in, or via GitHub Actions / CI webhook.
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit immediately on error

APP_DIR="/var/www/school-server"   # Change this to your actual app directory
PM2_NAME="school-server"           # PM2 process name (set during first setup)

echo "🚀 Starting deployment..."

# 1. Pull latest code from GitHub
cd "$APP_DIR"
git pull origin main
echo "✅ Code pulled from GitHub"

# 2. Install dependencies (production only)
npm ci --omit=dev
echo "✅ Dependencies installed"

# 3. Build TypeScript
npm run build
echo "✅ TypeScript compiled"

# 4. Restart app via PM2
pm2 restart "$PM2_NAME" --update-env
echo "✅ PM2 restarted: $PM2_NAME"

echo ""
echo "🎉 Deployment complete! Check logs with: pm2 logs $PM2_NAME"
