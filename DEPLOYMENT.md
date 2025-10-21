# 🚀 Deployment Configuration - Home Inventory

## Port Allocation & URL Scheme

### Current Configuration (Port 9100+)

```
API Service:    http://localhost:9100
Mobile App:     Connects to localhost:9100
Status:         ✅ RUNNING
```

### Port Allocation Strategy

All services use ports **above 9000** to avoid conflicts with other development projects:

| Service | Port | URL | Status |
|---------|------|-----|--------|
| Vision API | 9100 | http://localhost:9100 | ✅ Running |
| Future Service 1 | 9101 | Reserved | Available |
| Future Service 2 | 9102 | Reserved | Available |
| Future Service 3 | 9103 | Reserved | Available |

---

## 🎯 Quick Start

### Start API Service

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
PORT=9100 npm run dev
```

**Expected Output**:
```
Server listening at http://0.0.0.0:9100
Server started successfully
  port: 9100
  nodeEnv: "development"
```

### Start Mobile App

```bash
cd /Users/mrarindampaul/Develop/allmythings/mobile-app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run
```

---

## 📝 Configuration Files

### API Service

**Location**: `api-service/.env`

```env
# Server Configuration
PORT=9100
NODE_ENV=development
HOST=0.0.0.0

# Google Cloud Vision
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# AWS Rekognition (optional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Ensemble Configuration
ENSEMBLE_CONFIDENCE_THRESHOLD=0.7
PROVIDER_TIMEOUT_MS=4000
NMS_IOU_THRESHOLD=0.5

# Provider Weights
META_WEIGHT=0.30
GOOGLE_WEIGHT=0.30
AWS_WEIGHT=0.25
TENSORFLOW_WEIGHT=0.15
```

### Mobile App

**Location**: `mobile-app/lib/core/config/app_config.dart`

```dart
class AppConfig {
  static const String apiBaseUrl =
    String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://localhost:9100');

  static const String appName = 'Home Inventory';
  static const String apiPort = '9100';
}
```

---

## 🔧 Running Multiple Instances

If you need to run multiple instances (e.g., for different projects):

### Instance 1 (Default)
```bash
PORT=9100 npm run dev  # API
flutter run -d device1  # Mobile
```

### Instance 2 (Alternate Project)
```bash
PORT=9101 npm run dev  # Different API
flutter run -d device2 --dart-define=API_BASE_URL=http://localhost:9101
```

---

## 🌐 Network Configuration

### Local Development
- **API**: Binds to `0.0.0.0:9100` (accessible from LAN)
- **Mobile**: Connects to `localhost:9100` (simulator/emulator)

### Physical Device Testing
If testing on a physical device connected to the same network:

1. **Find your machine's IP**:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. **Update mobile app config**:
   ```dart
   // In app_config.dart
   static const String apiBaseUrl = 'http://192.168.1.X:9100';
   ```

3. **Rebuild app**:
   ```bash
   flutter run -d physical-device
   ```

---

## 📦 Production Deployment

### API Service (Cloud Deployment)

#### Option 1: Docker Container

**Create**: `api-service/Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 9100

CMD ["node", "dist/app.js"]
```

**Build & Run**:
```bash
docker build -t home-inventory-api .
docker run -p 9100:9100 --env-file .env home-inventory-api
```

#### Option 2: PM2 (Process Manager)

**Install PM2**:
```bash
npm install -g pm2
```

**Create**: `api-service/ecosystem.config.js`

```javascript
module.exports = {
  apps: [{
    name: 'home-inventory-api',
    script: './dist/app.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 9100
    }
  }]
};
```

**Start**:
```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-start on boot
```

#### Option 3: Cloud Providers

**Heroku**:
```bash
heroku create home-inventory-api
heroku config:set PORT=9100
git push heroku main
```

**AWS EC2**:
```bash
# Install Node.js on EC2
# Clone repository
# Set environment variables
PORT=9100 npm start
```

**Google Cloud Run**:
```bash
gcloud run deploy home-inventory-api \
  --source . \
  --port 9100 \
  --allow-unauthenticated
```

### Mobile App

#### iOS Deployment

```bash
cd mobile-app
flutter build ios --release
# Open Xcode and archive for App Store
```

#### Android Deployment

```bash
cd mobile-app
flutter build appbundle --release
# Upload to Google Play Console
```

---

## 🔍 Health Checks

### API Health Check

```bash
curl http://localhost:9100/v1/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "providers": {
    "google": true,
    "aws": false
  },
  "timestamp": "2025-10-19T22:24:54.530Z"
}
```

### Root Endpoint

```bash
curl http://localhost:9100/
```

**Expected Response**:
```json
{
  "service": "Visual Home Inventory - Vision API",
  "version": "1.0.0",
  "status": "running",
  "endpoints": [
    "POST /v1/detect",
    "GET /v1/health"
  ]
}
```

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Find process using port 9100
lsof -i :9100

# Kill process
kill -9 <PID>

# Or use different port
PORT=9101 npm run dev
```

### API Not Responding

1. **Check if running**:
   ```bash
   curl http://localhost:9100/v1/health
   ```

2. **Check logs**:
   - API logs show in terminal where `npm run dev` is running
   - Look for errors in startup

3. **Restart service**:
   ```bash
   # Kill current process
   pkill -f "tsx watch"

   # Restart
   PORT=9100 npm run dev
   ```

### Mobile App Can't Connect

1. **Verify API is running**:
   ```bash
   curl http://localhost:9100/v1/health
   ```

2. **Check mobile app config**:
   ```dart
   // mobile-app/lib/core/config/app_config.dart
   static const String apiBaseUrl = 'http://localhost:9100';
   ```

3. **Rebuild mobile app**:
   ```bash
   flutter clean
   flutter pub get
   flutter run
   ```

---

## 📊 Monitoring

### Development Monitoring

**API Logs**:
```bash
# Running in terminal shows real-time logs
PORT=9100 npm run dev

# Logs show:
# - Incoming requests
# - Processing time
# - Errors
# - Provider status
```

**Mobile App Logs**:
```bash
# Flutter logs in terminal
flutter run

# Or attach to running app
flutter attach
```

### Production Monitoring

**PM2 Dashboard**:
```bash
pm2 monit
```

**Docker Logs**:
```bash
docker logs -f home-inventory-api
```

---

## 🔐 Security Considerations

### Development

- ✅ CORS enabled for all origins (development only)
- ✅ Rate limiting: 100 requests/minute
- ✅ Body size limit: 10MB
- ⚠️ No authentication (add for production)

### Production Recommendations

1. **Add Authentication**:
   ```typescript
   // Add JWT or API key authentication
   app.addHook('onRequest', async (request, reply) => {
     // Verify auth header
   });
   ```

2. **Restrict CORS**:
   ```typescript
   await app.register(cors, {
     origin: ['https://yourdomain.com'],
   });
   ```

3. **HTTPS Only**:
   ```typescript
   // Use reverse proxy (nginx) or
   await app.listen({
     port: 9100,
     host: '0.0.0.0',
     https: {
       cert: fs.readFileSync('cert.pem'),
       key: fs.readFileSync('key.pem')
     }
   });
   ```

4. **Environment Variables**:
   - Never commit `.env` file
   - Use secret management (AWS Secrets Manager, etc.)

---

## 📚 Scripts Reference

### API Service Scripts

```bash
npm run dev          # Development with hot reload
npm run build        # Build TypeScript to JavaScript
npm start            # Production (requires build first)
npm test             # Run tests
npm run lint         # Lint code
npm run format       # Format code with Prettier
```

### Mobile App Scripts

```bash
flutter pub get                              # Install dependencies
flutter run                                  # Run in debug mode
flutter run --release                        # Run in release mode
flutter build apk                            # Build Android APK
flutter build appbundle                      # Build Android App Bundle
flutter build ios                            # Build iOS app
dart run build_runner build                  # Generate code
dart run build_runner watch                  # Watch and generate
```

---

## ✅ Deployment Checklist

### Before Deployment

- [ ] Update `.env` with production credentials
- [ ] Configure Google Cloud Vision API
- [ ] Test API health endpoint
- [ ] Test mobile app connectivity
- [ ] Run `npm run build` (API)
- [ ] Run `flutter build` (Mobile)
- [ ] Set up monitoring
- [ ] Configure backups (database)
- [ ] Set up SSL/TLS
- [ ] Add authentication
- [ ] Restrict CORS
- [ ] Update rate limits for production

### After Deployment

- [ ] Verify health checks
- [ ] Test object detection
- [ ] Test search functionality
- [ ] Monitor logs for errors
- [ ] Set up alerts
- [ ] Document production URLs
- [ ] Update mobile app with production URL

---

## 🎯 Current Status

```
✅ API Running:     http://localhost:9100
✅ Port:            9100 (above 9000 as requested)
✅ Health Check:    Responding
✅ Mobile Config:   Updated to port 9100
✅ Ready:           For development and testing
```

**To Start Everything**:

```bash
# Terminal 1: API Service
cd api-service
PORT=9100 npm run dev

# Terminal 2: Mobile App
cd mobile-app
flutter run
```

**Everything is now running on port 9100!** 🚀
