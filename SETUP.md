# DRMS Setup & Run Guide

## Prerequisites
- **Node.js** v20.19.4+ (check: `node --version`)
- **MongoDB** (Local or Atlas)
- **npm** v10+

## Quick Start (All in One)

### 1. Install Dependencies

```powershell
# Server
cd 'c:\New folder\school_n\server'
npm install

# Client  
cd 'c:\New folder\school_n\client'
npm install

# Android
cd 'c:\New folder\school_n\android'
npm install
```

### 2. Seed Database with Demo Users

**Option A: Via API** (Recommended)
```powershell
cd 'c:\New folder\school_n\server'
npm run dev
```

Then in another terminal, curl or Postman:
```
POST http://localhost:5000/api/seed
```

Response will show demo users created.

**Option B: Via npm script** (If seed script exists)
```powershell
cd 'c:\New folder\school_n\server'
npm run seed
```

### 3. Start All Three Services

**Terminal 1 - Server:**
```powershell
cd 'c:\New folder\school_n\server'
npm run dev
# Output: DRMS Server running on port 5000
```

**Terminal 2 - Client (Web):**
```powershell
cd 'c:\New folder\school_n\client'
npm run dev
# Output: ▲ Next.js running on http://localhost:3000
```

**Terminal 3 - Android:**
```powershell
cd 'c:\New folder\school_n\android'
npx expo start -c
# Scan QR code with Expo Go app
```

## Demo Login Credentials

After seeding:
```
Email: head@demoschool.edu
Password: admin123

OR

Email: coordinator@demoschool.edu
Password: admin123

OR

Email: student@demoschool.edu
Password: admin123
```

## Services & URLs

| Service | URL | Status |
|---------|-----|--------|
| Server API | http://localhost:5000/api | ✅ |
| Web Client | http://localhost:3000 | ✅ |
| Android Emulator | Expo Go app | ✅ |
| MongoDB | localhost:27017 | ✅ (local) |

## API Health Check

```powershell
curl http://localhost:5000/api/health
# Output: {"status":"OK","message":"DRMS Server is running"}
```

## Common Issues & Fixes

### 1. "Could not resolve react-native"
```powershell
cd android
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

### 2. "ERESOLVE unable to resolve dependency tree"
```powershell
cd android
npm install --legacy-peer-deps
```

### 3. "MongoDB connection refused"
- **Local:** Start MongoDB: `mongod`
- **Atlas:** Check connection string in `.env` MONGO_URI

### 4. "Invalid email or password" on login
- Check if database is seeded
- Call: `POST http://localhost:5000/api/seed`
- Use correct credentials from seed output

### 5. "Bundler cache is empty"
- This is normal on first run, just wait 1-2 minutes

## File Structure

```
school_n/
├── server/          # Node.js/Express backend
│   ├── src/
│   │   ├── controllers/   # API logic
│   │   ├── models/        # MongoDB schemas
│   │   ├── routes/        # API endpoints
│   │   └── config/        # Database config
│   └── .env         # Environment variables
├── client/          # Next.js web frontend
│   ├── app/         # Pages & layouts
│   ├── components/  # React components
│   ├── lib/         # API client, auth
│   └── .env.local   # Environment variables
└── android/         # Expo React Native app
    ├── app/         # Screens & navigation
    ├── assets/      # Images & icons
    └── package.json # Dependencies
```

## Environment Variables

### Server (.env)
```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/drms
MONGO_DB_NAME=drms
JWT_SECRET=super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012
FRONTEND_URL=http://localhost:3000
MOBILE_URL=http://localhost:8081
```

### Client (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### Android (.env)
```
API_URL=http://10.0.2.2:5000/api
```

## Features Implemented

✅ User Authentication (Login/Register)
✅ Dashboard
✅ Student Management
✅ Teacher Management
✅ Attendance Tracking
✅ Finance Management
✅ ID Card Generation
✅ Notices
✅ Reports
✅ Role-Based Access Control (RBAC)

## Development Commands

```powershell
# Server
npm run dev       # Development with auto-reload
npm run build     # Build TypeScript
npm run seed      # Seed database with demo data

# Client
npm run dev       # Development server
npm run build     # Build for production
npm run lint      # Check code quality

# Android
npx expo start -c     # Start with cache clear
npx expo run:android  # Build & run on emulator
npx expo run:ios      # Build & run on iOS (Mac only)
```

## Testing Login Flow

1. **Open Web Client:** http://localhost:3000
2. **Click "Login"**
3. **Enter Credentials:**
   - Email: `head@demoschool.edu`
   - Password: `admin123`
4. **Click "Sign In"**
5. **See Dashboard**

## For Android Testing

1. **Install Expo Go** from Play Store or App Store
2. **Make sure server is running** on port 5000
3. **Run:** `npx expo start -c`
4. **Scan QR code** with Expo Go
5. **Use same credentials** as web login

## Production Deployment

For deployment, update:
- `.env` JWT_SECRET with a strong random value
- `.env` MONGO_URI with production database
- `.env` FRONTEND_URL with production domain
- `.env` MOBILE_URL with production mobile URL

## Support

For issues:
1. Check MongoDB is running
2. Verify `.env` files exist and are configured
3. Clear cache: `npx expo start -c`
4. Check error messages in server console
5. Try: `npm install --legacy-peer-deps`

## Success Indicators

✅ Server starts without errors
✅ Client loads on localhost:3000
✅ Can seed database via API
✅ Can login with demo credentials
✅ Dashboard displays after login
✅ Android app loads with Expo Go

---

**Happy coding! 🚀**
