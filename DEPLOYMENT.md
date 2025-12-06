# Deployment Guide - The Last of Guss

## Prerequisites

1. Install flyctl: `brew install flyctl`
2. Login to Fly.io: `flyctl auth login`

## First Time Setup

### 1. Prepare External Postgres

You already have a Postgres database. Make sure:
- Database is accessible from the internet (or use Fly.io private network)
- You have the connection string: `postgresql://user:password@host:5432/dbname`

### 2. Deploy Backend

```bash
cd backend

# Create backend app
flyctl launch --no-deploy

# Set secrets (use YOUR external Postgres connection string)
flyctl secrets set DATABASE_URL="postgresql://user:password@your-postgres-host:5432/last_of_guss"
flyctl secrets set JWT_SECRET="$(openssl rand -hex 32)"

# Deploy
flyctl deploy
```

### 3. Deploy Frontend

```bash
cd frontend

# Create frontend app
flyctl launch --no-deploy

# Deploy
flyctl deploy
```

## Update Deployment

### Backend Updates

```bash
cd backend
flyctl deploy
```

### Frontend Updates

```bash
cd frontend
flyctl deploy
```

## View Logs

```bash
# Backend logs
flyctl logs -a last-of-guss-backend

# Frontend logs
flyctl logs -a last-of-guss-frontend
```

## Scale (if needed)

```bash
# Scale backend to handle more players
flyctl scale count 2 -a last-of-guss-backend

# Scale backend memory
flyctl scale memory 1024 -a last-of-guss-backend
```

## Multi-Region Deployment (Optional)

To deploy closer to players worldwide:

```bash
# Add regions
flyctl regions add iad -a last-of-guss-backend  # US-East
flyctl regions add sin -a last-of-guss-backend  # Singapore

# Scale to those regions
flyctl scale count 3 -a last-of-guss-backend
```

## Environment Variables

### Backend (.env)
- `DATABASE_URL` - Postgres connection string (set via secrets)
- `JWT_SECRET` - JWT signing key (set via secrets)
- `PORT` - Server port (default: 3000)
- `ROUND_DURATION` - Game round duration in seconds (default: 60)
- `COOLDOWN_DURATION` - Cooldown between rounds (default: 30)

### Frontend (.env.production)
- `VITE_API_URL` - Backend API URL
- `VITE_WS_URL` - Backend WebSocket URL

## URLs After Deployment

- **Frontend**: https://last-of-guss-frontend.fly.dev
- **Backend**: https://last-of-guss-backend.fly.dev
- **Health Check**: https://last-of-guss-backend.fly.dev/health

## Troubleshooting

### Backend won't start
```bash
# Check logs
flyctl logs -a last-of-guss-backend

# SSH into machine
flyctl ssh console -a last-of-guss-backend
```

### Database connection issues
- Check that your external Postgres allows connections from Fly.io IPs
- Test connection from Fly.io machine:
```bash
flyctl ssh console -a last-of-guss-backend
# Inside the machine:
psql $DATABASE_URL
```

### WebSocket issues
- Make sure CORS is configured correctly in backend/src/index.ts
- Check that frontend is using `wss://` (not `ws://`) in production
