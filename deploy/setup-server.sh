#!/bin/bash
set -e

echo "🚀 Setting up VPS for Last of Guss deployment..."

# Install Docker
echo "📦 Installing Docker..."
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
systemctl start docker
systemctl enable docker

# Install nginx for reverse proxy
echo "🌐 Installing nginx..."
apt-get install -y nginx certbot python3-certbot-nginx

# Create directory for the app
echo "📁 Creating app directory..."
mkdir -p /opt/last-of-guss
cd /opt/last-of-guss

echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Upload your code to /opt/last-of-guss"
echo "2. Run docker compose up -d"
echo "3. Setup SSL with certbot"
