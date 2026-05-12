# DRMS - Quick Start Guide

This is a complete School Management System with Web Client, Mobile App, and Backend Server.

## 📋 Prerequisites

- **Node.js** (v16+)
- **npm** (v8+)
- **MongoDB** (running locally on `localhost:27017`)
- **Android Emulator** (for mobile testing) or Android Studio

## 🚀 Setup Instructions

### 1. Server Setup

```bash
cd server
npm install
```

Create `.env` file in `server/` directory:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/drms
MONGO_DB_NAME=drms
JWT_SECRET=super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012
NODE_ENV=development
EMAIL_ENABLED=false
```

Seed demo data:
```bash
npm run seed
```

This creates:
- Admin institution: "Demo School"
- Demo user email: `head@demoschool.edu`
- Demo user password: `admin123`

Start server:
```bash
npm run dev
```

Server runs at: `http://localhost:5000`

### 2. Web Client Setup

```bash
cd client
npm install
npm run dev
```

Web client runs at: `http://localhost:3000`

**Demo Login:**
- Email: `head@demoschool.edu`
- Password: `admin123`

### 3. Android Mobile App Setup

```bash
cd android
npm install
npx expo start -c
```

**On the Expo prompt:**
- Press `a` to open Android Emulator
- Press `w` to open in web browser (Expo Web)
- Scan QR code with Expo Go app on physical device

**Network Note:**
- Android Emulator uses `10.0.2.2:5000` to reach host machine
- Physical Android devices use `192.168.x.x:5000` (replace with your LAN IP)

## 📱 Testing the App

### Register New Account (Web)
1. Go to `http://localhost:3000`
2. Click "Don't have an account? Register" on login page
3. Fill form and click "Create Account"
4. Login with new credentials

### Register New Account (Android)
1. Start Android Emulator
2. On Login screen, tap "Create New Account"
3. Fill form and tap "Create Account"
4. Login with new credentials

### Test Login Flow
1. **Web:** Login at `http://localhost:3000/login`
2. **Android:** Tap "Login" and enter credentials
3. **Both:** Should see Dashboard after successful login

## 📁 Project Structure

```
school_n/
├── server/              # Node.js Express API
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   └── config/
│   ├── .env             # Environment variables (NOT in git)
│   └── package.json
├── client/              # Next.js Web Application
│   ├── app/
│   │   ├── login/
│   │   ├── register/
│   │   ├── dashboard/
│   │   └── layout.tsx
│   ├── components/
│   ├── lib/
│   └── package.json
└── android/             # React Native Expo App
    ├── app/
    │   ├── navigation/
    │   ├── hooks/
    │   └── screens/
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── RegisterScreen.tsx
    │   └── DashboardScreen.tsx
    ├── app.json
    └── package.json
```

## 🔑 API Endpoints

All endpoints are on `http://localhost:5000/api`

### Authentication
- `POST /auth/login` - Login with email and password
- `POST /auth/register` - Create new account
- `GET /auth/profile` - Get current user profile (requires token)

## 🛠️ Troubleshooting

### Android Emulator Can't Connect to Server
**Problem:** `Network Error: connect ECONNREFUSED`

**Solution:**
- Make sure server is running: `npm run dev` in `server/` folder
- In Android: The app uses `10.0.2.2:5000` (correct for emulator)
- For physical device: Change API_BASE_URL in `android/app/hooks/useAuth.tsx` to your LAN IP

### Database Connection Error
**Problem:** `MongooseError: Cannot connect to MongoDB`

**Solution:**
- Start MongoDB locally (default port 27017)
- Or update `MONGO_URI` in `server/.env`
- Check MongoDB is running: `mongosh` in terminal

### Port Already in Use
**Server (port 5000):**
```bash
# Windows
netstat -ano | findstr :5000

# Kill process (Windows, replace PID)
taskkill /PID <PID> /F
```

**Web Client (port 3000):**
```bash
# Windows
netstat -ano | findstr :3000

# Kill process
taskkill /PID <PID> /F
```

### npm install ERESOLVE Issues
Delete `node_modules` and `package-lock.json`, then reinstall:
```bash
rm -r node_modules package-lock.json
npm install
```

## 📦 Technology Stack

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- TypeScript

**Web Frontend:**
- Next.js 14
- React 18
- Tailwind CSS
- React Hook Form

**Mobile App:**
- React Native (Expo SDK 54)
- React Native Paper (Material Design UI)
- React Hook Form
- TypeScript

## ✨ Features Implemented

✅ User Authentication (Login/Register)
✅ Role-based Access Control (Student/Parent/Teacher/Staff/Admin)
✅ Dashboard
✅ Attendance Tracking
✅ Finance Management
✅ ID Card Generation
✅ Notice Board
✅ Profile Management

## 📝 Notes

- **Security:** The `.env` file contains sensitive data. Never commit to git.
- **Database:** Demo data is seeded with default credentials for testing only.
- **CORS:** Server allows requests from `localhost:3000` and Android Expo.
- **Mobile API:** Android app uses special networking (10.0.2.2 for emulator).

## 🆘 Getting Help

Check the logs for errors:
- **Server logs:** Console output when running `npm run dev`
- **Mobile logs:** Expo console in terminal
- **Web logs:** Browser DevTools console (F12)

## 📞 Contact

For issues or questions about the setup, check:
1. MongoDB is running
2. Server `.env` is properly configured
3. All three `npm install` commands completed successfully
4. Ports 3000, 5000 are not in use
