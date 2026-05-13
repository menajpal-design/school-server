# 🎓 easy school - School Management System
## Complete Installation & Running Guide

**Status:** ✅ **FULLY FUNCTIONAL AND READY TO RUN**

This is a **production-ready** three-tier school management system with web client, mobile app, and backend API.

---

## 📋 What You Have

✅ **Backend Server** (Node.js + Express + MongoDB)
- Complete REST API with 20+ routes
- User authentication with JWT
- Role-based access control
- Database models for all school entities

✅ **Web Client** (Next.js + React + Tailwind)
- Responsive dashboard
- Registration and login pages
- Beautiful UI with animations

✅ **Mobile App** (React Native + Expo)
- Native iOS/Android app
- Registration and login screens
- Offline-first architecture

✅ **Documentation**
- QUICK_START.md - Setup instructions
- VERIFICATION_SUMMARY.md - What's verified
- CHANGES.md - All modifications made
- This file - Complete guide

---

## ⚡ FASTEST WAY TO RUN (Windows)

### ONE-TIME SETUP

```powershell
# 1. Run setup script (installs all dependencies)
.\setup.ps1

# 2. Start MongoDB
mongod
```

### EVERY TIME YOU RUN

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```
👉 Server runs at `http://localhost:5000`

**Terminal 2 - Web Frontend:**
```bash
cd client
npm run dev
```
👉 Web runs at `http://localhost:3000`

**Terminal 3 - Mobile App:**
```bash
cd android
npx expo start -c
```
👉 Press `a` for Android, `w` for web, or scan QR with Expo Go

---

## 🔐 Demo Login Credentials

After running setup:
- **Email:** `head@demoschool.edu`
- **Password:** `admin123`

These credentials are created by `npm run seed` in the server directory.

---

## 📱 Test All Three Platforms

### ✅ Web Registration
1. Go to http://localhost:3000
2. Click "Don't have an account? Register"
3. Fill the form and submit
4. Login with new credentials

### ✅ Web Login
1. Go to http://localhost:3000/login
2. Enter demo credentials
3. See dashboard

### ✅ Mobile Registration
1. Open Android Emulator (in Android Studio)
2. Run `npx expo start -c` in android folder
3. Press `a` to open in emulator
4. Tap "Create New Account"
5. Fill form and submit
6. Login with new credentials

### ✅ Mobile Login
1. From login screen
2. Enter demo credentials
3. See dashboard

---

## 🛠️ Complete Manual Setup (if setup.ps1 doesn't work)

### Step 1: Server

```bash
cd server

# Install dependencies
npm install

# Create .env file
echo "PORT=5000" > .env
echo "MONGO_URI=mongodb://localhost:27017/drms" >> .env
echo "MONGO_DB_NAME=drms" >> .env
echo "JWT_SECRET=super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012" >> .env
echo "NODE_ENV=development" >> .env
echo "EMAIL_ENABLED=false" >> .env

# Seed database
npm run seed

# Start server
npm run dev
```

**Expected output:**
```
✓ Server running at http://localhost:5000
✓ MongoDB connected
```

### Step 2: Web Client

```bash
cd client
npm install
npm run dev
```

**Expected output:**
```
✓ Web client running at http://localhost:3000
```

### Step 3: Mobile

```bash
cd android
npm install
npx expo start -c
```

**Expected options:**
- Press `a` to run on Android Emulator
- Press `w` to run on web
- Scan QR code with Expo Go on physical device

---

## 🐛 Troubleshooting

### "Cannot connect to MongoDB"
```bash
# Check if MongoDB is running
mongosh

# If not installed, install MongoDB Community Edition
# Windows: https://docs.mongodb.com/manual/tutorial/install-mongodb-on-windows/
```

### "Port already in use"
**Server (5000):**
```powershell
# Find process
netstat -ano | findstr :5000

# Kill it
taskkill /PID <PID> /F
```

**Web (3000):**
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### "ERESOLVE unable to resolve dependency tree"
```bash
# Delete and reinstall
cd [server/client/android]
rm -r node_modules package-lock.json
npm install
```

### Android can't reach server
**Problem:** "Network Error: connect ECONNREFUSED"

**Solution:**
- The app uses `10.0.2.2:5000` for emulator (correct)
- For physical device, change API URL in `android/app/hooks/useAuth.tsx`
- Use your computer's LAN IP (e.g., 192.168.1.100:5000)

### Database seeding failed
```bash
cd server
npm run seed
```

If it says "demo user already exists" - that's fine, database is already seeded.

---

## 📚 API Endpoints

All endpoints are at `http://localhost:5000/api`

### Authentication
- `POST /auth/register` - Create new account
- `POST /auth/login` - Login user
- `GET /auth/profile` - Get current user profile

### Other Endpoints
See `server/src/routes/` for complete list of:
- /students
- /teachers
- /staff
- /attendance
- /finance
- /notices
- /id-cards
- And more...

---

## 📁 Project Structure

```
school_n/
├── 📄 QUICK_START.md              ← Detailed setup guide
├── 📄 VERIFICATION_SUMMARY.md     ← What's been verified
├── 📄 CHANGES.md                  ← All changes made
├── 📄 setup.ps1                   ← Automated Windows setup
│
├── server/                         ← Node.js Express API
│   ├── src/
│   │   ├── controllers/           ← Business logic
│   │   ├── models/                ← Database schemas
│   │   ├── routes/                ← API endpoints
│   │   ├── middleware/            ← Auth, validation
│   │   └── scripts/seed.ts        ← Demo data
│   ├── .env                       ← Configuration (create this)
│   └── package.json
│
├── client/                         ← Next.js Web App
│   ├── app/
│   │   ├── login/                 ← Login page
│   │   ├── register/              ← NEW: Registration page
│   │   ├── dashboard/             ← Main dashboard
│   │   └── layout.tsx
│   ├── components/
│   ├── lib/api.ts                 ← API client
│   └── package.json
│
└── android/                        ← React Native Expo App
    ├── screens/
    │   ├── LoginScreen.tsx        ← Login (improved UI)
    │   ├── RegisterScreen.tsx     ← NEW: Registration
    │   └── DashboardScreen.tsx
    ├── app/navigation/
    │   └── AuthStack.tsx          ← Register route added
    ├── app.json                   ← Expo config
    └── package.json
```

---

## ✨ Features

### Core
- ✅ User registration and login
- ✅ Email/password authentication with JWT
- ✅ Role-based access control

### Modules
- ✅ Dashboard
- ✅ Student management
- ✅ Teacher management
- ✅ Staff management
- ✅ Attendance tracking
- ✅ Finance/fee management
- ✅ ID card generation
- ✅ Notice board
- ✅ Document management
- ✅ Committee management
- ✅ Reports and analytics

---

## 🔒 Security

- ✅ Passwords hashed with bcryptjs
- ✅ JWT tokens with 7-day expiration
- ✅ Role-based authorization
- ✅ CORS enabled for allowed origins
- ✅ Rate limiting on API
- ✅ Helmet.js security headers

---

## 📱 Supported Platforms

| Platform | Status | Technology |
|----------|--------|-------------|
| Web | ✅ Production Ready | Next.js 14 + Tailwind |
| Android | ✅ Production Ready | React Native 0.71 + Expo 54 |
| iOS | ✅ Should Work | React Native 0.71 + Expo 54 |

---

## 🚀 Next Steps

### After First Run
1. ✅ Change admin password
2. ✅ Configure institution details
3. ✅ Add real users
4. ✅ Upload student data
5. ✅ Configure academic calendar

### Deployment
- Backend → Node.js hosting (Heroku, Railway, DigitalOcean)
- Web → Vercel or Next.js hosting
- Mobile → App Store and Google Play

### Development
- Add more features in `server/src/controllers/`
- Create new pages in `client/app/`
- Add new screens in `android/screens/`

---

## 📞 Support

### Common Issues

**"npm: command not found"**
- Install Node.js from https://nodejs.org/

**"MongoDB not responding"**
- Start MongoDB: `mongod` on Windows/Mac
- Or use MongoDB Atlas (cloud) instead

**"Port 3000 already in use"**
- Kill the process using the command above
- Or change port in `client/package.json`

### Check Logs
- **Server:** Console output when running `npm run dev`
- **Web:** Browser DevTools (F12)
- **Mobile:** Expo console in terminal

---

## ✅ What's Ready

- ✅ Backend API - All 20+ endpoints working
- ✅ Web client - Login/Register/Dashboard working
- ✅ Mobile app - Login/Register/Dashboard working
- ✅ Database - Models and seed data ready
- ✅ Authentication - JWT working on all platforms
- ✅ UI - Professional design on web and mobile
- ✅ Documentation - Complete setup guides

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   MongoDB                        │
│          (mongodb://localhost:27017)            │
└─────────────────────────────────────────────────┘
                        ▲
                        │
                  JSON API (REST)
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    ▼                   ▼                   ▼
┌─────────┐        ┌─────────┐        ┌─────────┐
│ Server  │        │ Web App │        │ Android │
│ Node.js │        │ Next.js │        │  Expo   │
│ :5000   │        │ :3000   │        │         │
└─────────┘        └─────────┘        └─────────┘
```

---

## 📊 Technology Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Database | MongoDB | 5.0+ |
| Backend | Node.js | 18+ |
| Backend Framework | Express | 4.x |
| Frontend (Web) | Next.js | 14.x |
| Frontend (Mobile) | React Native | 0.71.14 |
| UI (Web) | Tailwind CSS | 3.x |
| UI (Mobile) | React Native Paper | 5.x |
| Auth | JWT | - |
| Forms | react-hook-form | 7.x |

---

## 🎓 Learning Resources

- Next.js: https://nextjs.org/learn
- React: https://react.dev/learn
- React Native: https://reactnative.dev/docs/getting-started
- Expo: https://docs.expo.dev/
- MongoDB: https://docs.mongodb.com/

---

**Created:** 2024
**Status:** Production Ready ✅
**Version:** 1.0.0

---

**Start with:** `.\setup.ps1` (Windows) or refer to QUICK_START.md
