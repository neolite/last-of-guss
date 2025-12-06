# VPS Deployment Guide

## Server: 85.31.45.127

## Prerequisites

- Domain name pointing to 85.31.45.127 (for SSL)
- SSH access to server
- Postgres connection string

## Step 1: Initial Server Setup

SSH into server and run setup script:

```bash
# Copy setup script to server
scp deploy/setup-server.sh root@85.31.45.127:/root/

# SSH into server
ssh root@85.31.45.127

# Run setup
chmod +x /root/setup-server.sh
/root/setup-server.sh
```

This will install:
- Docker & Docker Compose
- Nginx
- Certbot (for SSL)

## Step 2: Deploy Application

From your local machine:

```bash
# Copy project to server
rsync -avz --exclude 'node_modules' --exclude '.git' \
  /Users/rafkat/Apps/rafkat/last-of-guss/ \
  root@85.31.45.127:/opt/last-of-guss/

# SSH into server
ssh root@85.31.45.127
cd /opt/last-of-guss

# Create .env file for backend
cat > backend/.env <<EOF
DATABASE_URL=postgresql://user:password@your-postgres-host:5432/last_of_guss
JWT_SECRET=$(openssl rand -hex 32)
PORT=3000
ROUND_DURATION=60
COOLDOWN_DURATION=30
NODE_ENV=production
EOF

# Start services
docker compose up -d

# Check logs
docker compose logs -f
```

## Step 3: Setup Nginx & SSL

```bash
# Copy nginx config
cp /opt/last-of-guss/deploy/nginx.conf /etc/nginx/sites-available/last-of-guss

# Edit domain name in config
nano /etc/nginx/sites-available/last-of-guss
# Replace 'your-domain.com' with your actual domain

# Enable site
ln -s /etc/nginx/sites-available/last-of-guss /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Remove default site

# Test nginx config
nginx -t

# Restart nginx
systemctl restart nginx

# Get SSL certificate
certbot --nginx -d your-domain.com

# Auto-renewal is already setup by certbot
```

## Step 4: Verify Deployment

```bash
# Check that all containers are running
docker compose ps

# Check backend health
curl http://localhost:3000/health

# Check frontend
curl http://localhost:8080

# Check from outside
curl https://your-domain.com
curl https://your-domain.com/api/health
```

## Update Deployment

When you make changes:

```bash
# From local machine - sync code
rsync -avz --exclude 'node_modules' --exclude '.git' \
  /Users/rafkat/Apps/rafkat/last-of-guss/ \
  root@85.31.45.127:/opt/last-of-guss/

# SSH into server
ssh root@85.31.45.127
cd /opt/last-of-guss

# Rebuild and restart
docker compose down
docker compose up -d --build

# Or just restart without rebuild
docker compose restart
```

## Troubleshooting

### Check logs
```bash
docker compose logs backend
docker compose logs frontend
docker compose logs postgres
```

### Restart services
```bash
docker compose restart
```

### Check disk space
```bash
df -h
docker system prune -a  # Clean up old images
```

### Check ports
```bash
netstat -tulpn | grep -E ':(80|443|3000|8080|5432)'
```

## Firewall Setup (if needed)

```bash
# Allow HTTP, HTTPS, SSH
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Backup

### Backup Postgres
```bash
docker compose exec postgres pg_dump -U postgres last_of_guss > backup.sql
```

### Restore Postgres
```bash
cat backup.sql | docker compose exec -T postgres psql -U postgres last_of_guss
```
