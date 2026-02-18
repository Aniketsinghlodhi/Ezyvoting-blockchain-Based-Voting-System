# Docker Configuration for Production Deployment

## Backend Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY backend/src ./src

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package*.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]
```

Save as: `backend/Dockerfile`

## Frontend Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/ .

# Build Next.js app
RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.js ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["npm", "start"]
```

Save as: `frontend/Dockerfile`

## Docker Compose for Local Development

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6-alpine
    container_name: ezyvoting-mongo
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ezyuser
      MONGO_INITDB_ROOT_PASSWORD: ezypass123
    volumes:
      - mongo-data:/data/db
    networks:
      - ezyvoting-network

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: ezyvoting-backend
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: development
      PORT: 4000
      CONTRACT_ADDRESS: 0x...
      NETWORK: sepolia
      RPC_URL: https://sepolia.infura.io/v3/YOUR_KEY
      MONGO_URI: mongodb://ezyuser:ezypass123@mongodb:27017/ezyvoting-dev?authSource=admin
      JWT_SECRET: dev-secret-change-in-production
      ALLOWED_ORIGINS: http://localhost:3000,http://localhost:3001
    depends_on:
      - mongodb
    volumes:
      - ./backend/src:/app/src
    networks:
      - ezyvoting-network
    command: npm run dev

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    container_name: ezyvoting-frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_CONTRACT_ADDRESS: 0x...
      NEXT_PUBLIC_NETWORK: sepolia
      NEXT_PUBLIC_RPC_URL: https://sepolia.infura.io/v3/YOUR_KEY
      NEXT_PUBLIC_API_URL: http://backend:4000
    depends_on:
      - backend
    networks:
      - ezyvoting-network

volumes:
  mongo-data:

networks:
  ezyvoting-network:
    driver: bridge
```

Save as: `docker-compose.yml`

## Docker Deployment Commands

```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up --build -d

# Run migrations in backend
docker-compose exec backend npm run migrate

# Access MongoDB
docker-compose exec mongodb mongosh -u ezyuser -p ezypass123
```

## Production Docker Compose (with environment file)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  mongodb:
    image: mongo:6-alpine
    restart: always
    env_file:
      - .env.prod
    volumes:
      - mongo-backup:/backup
    networks:
      - ezyvoting-prod

  backend:
    image: ezyvoting/backend:latest
    restart: always
    env_file:
      - .env.prod
    environment:
      NODE_ENV: production
    depends_on:
      - mongodb
    networks:
      - ezyvoting-prod

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - backend
      - frontend
    networks:
      - ezyvoting-prod

volumes:
  mongo-backup:

networks:
  ezyvoting-prod:
```

## Nginx Reverse Proxy Configuration

```nginx
# nginx.conf
upstream backend {
    server backend:4000;
}

upstream frontend {
    server frontend:3000;
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json;
    gzip_min_length 1000;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        
        # Request timeout for long operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://backend/health;
        access_log off;
    }
}
```

Save as: `nginx.conf`

## Deploying to AWS ECS with Docker

### Step 1: Create ECR Repository

```bash
# Create ECR repositories for backend and frontend
aws ecr create-repository --repository-name ezyvoting-backend --region us-east-1
aws ecr create-repository --repository-name ezyvoting-frontend --region us-east-1
```

### Step 2: Build and Push Images

```bash
# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Build and tag
docker build -f backend/Dockerfile -t ezyvoting-backend:latest .
docker tag ezyvoting-backend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/ezyvoting-backend:latest

# Push
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/ezyvoting-backend:latest
```

### Step 3: ECS Task Definition

```json
{
  "family": "ezyvoting-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/ezyvoting-backend:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 4000,
          "hostPort": 4000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "MONGO_URI",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:ezyvoting/mongo:MONGO_URI::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ezyvoting-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

## Local Development Quick Start

```bash
# 1. Clone repository
git clone https://github.com/yourusername/ezyvoting.git
cd ezyvoting

# 2. Start services
docker-compose up -d

# 3. Check services are running
docker-compose ps

# 4. View logs
docker-compose logs -f backend

# 5. Test backend
curl http://localhost:4000/health

# 6. Test frontend
open http://localhost:3000
```

---

**Last Updated**: February 18, 2026
