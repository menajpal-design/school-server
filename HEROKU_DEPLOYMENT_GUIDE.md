# 🚀 Heroku Deployment Guide

## DRMS - School Management System

এই গাইড ফলো করে আপনি Heroku-তে সার্ভার এবং ক্লায়েন্ট ডিপ্লয় করতে পারবেন।

---

## 📋 Prerequisites

আপনার কাছে থাকতে হবে:

1. **Heroku Account** - https://www.heroku.com
2. **Heroku CLI** - https://devcenter.heroku.com/articles/heroku-cli
3. **Git** - Version control system
4. **Node.js** - v16 বা তার উপরে
5. **MongoDB Atlas Account** - Cloud database (Optional কিন্তু প্রয়োজনীয়)

### Installation Steps:

```bash
# Heroku CLI ইনস্টল করুন
# Windows: scoop install heroku-cli
# MacOS: brew tap heroku/brew && brew install heroku
# Linux: curl https://cli-assets.heroku.com/install.sh | sh

# Verify installation
heroku --version
```

---

## 🔧 Step 1: MongoDB Atlas Setup

### MongoDB Atlas Database তৈরি করুন:

1. https://www.mongodb.com/cloud/atlas এ যান
2. আপনার account এ login করুন (নতুন হলে create করুন)
3. **Create a Cluster** এ ক্লিক করুন
4. **AWS** → **Free Tier** নির্বাচন করুন
5. Cluster তৈরি হোক (10-15 মিনিট সময় লাগে)
6. **Database Access** → **Add Database User** এ যান
7. Username এবং Password তৈরি করুন (নিরাপদ রাখুন)
8. **Network Access** → **Add IP Address** এ যান
9. **Allow Access from Anywhere** (0.0.0.0/0) নির্বাচন করুন

### Connection String পান:

1. Cluster → **Connect** বাটনে ক্লিক করুন
2. **Connect your application** নির্বাচন করুন
3. **Copy** বাটন ক্লিক করুন
4. এটি কোথাও safe রাখুন - এটি `MONGO_URI` হবে

Example:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/drms?retryWrites=true&w=majority
```

---

## 👤 Step 2: Heroku Login

```bash
# Heroku login করুন
heroku login

# Browser খুলবে - login করুন এবং authorize করুন
```

---

## 📦 Step 3: Server Deployment

### 3.1 Heroku অ্যাপ তৈরি করুন:

```bash
cd server

# Heroku app তৈরি করুন
heroku create drms-server

# Or custom name দিয়ে:
heroku create your-app-name
```

### 3.2 Environment Variables সেট করুন:

```bash
# MongoDB URI সেট করুন
heroku config:set MONGO_URI="mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/drms?retryWrites=true&w=majority"

# Other environment variables
heroku config:set JWT_SECRET="your_super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012"
heroku config:set NODE_ENV="production"
heroku config:set IMGBB_API_KEY="your_imgbb_api_key"
```

### 3.3 Deploy করুন:

```bash
# Git push করে deploy করুন
git push heroku main

# Or যদি branch different হয়:
git push heroku your-branch-name:main
```

### 3.4 Logs চেক করুন:

```bash
# Server logs দেখুন
heroku logs --tail

# Log দেখা বন্ধ করতে: Ctrl+C
```

### 3.5 Server URL পান:

```bash
# App info দেখুন
heroku info

# Your deployed server will be at:
# https://drms-server.herokuapp.com
```

---

## 🎨 Step 4: Client Deployment

### 4.1 Heroku অ্যাপ তৃতীয় করুন:

```bash
cd ../client

# Heroku app তৈরি করুন
heroku create drms-client

# Or custom name দিয়ে:
heroku create your-client-name
```

### 4.2 Environment Variables সেট করুন:

```bash
# Server URL এ point করুন
heroku config:set NEXT_PUBLIC_API_URL="https://drms-server.herokuapp.com/api"
```

### 4.3 Build settings কনফিগার করুন:

```bash
# Next.js specific buildpack (optional but recommended)
heroku buildpacks:add heroku/nodejs

# Or stick with default Node.js buildpack
```

### 4.4 Deploy করুন:

```bash
# Git push করে deploy করুন
git push heroku main
```

### 4.5 Logs চেক করুন:

```bash
heroku logs --tail
```

### 4.6 Client URL পান:

```bash
heroku info

# Your deployed client will be at:
# https://drms-client.herokuapp.com
```

---

## 🔗 Step 5: Enable CORS in Server

Server এর app.ts এ CORS সেটআপ verify করুন:

```typescript
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ],
  credentials: true,
};

app.use(cors(corsOptions));
```

এবং Heroku এ update করুন:

```bash
cd ../server

heroku config:set FRONTEND_URL="https://drms-client.herokuapp.com"

git push heroku main
```

---

## ✅ Step 6: Test Your Deployment

### Test Server:

```bash
# Browser এ খুলুন বা curl করুন
curl https://drms-server.herokuapp.com/api/health

# Response:
# { "status": "ok" }
```

### Test Client:

```bash
# Browser এ খুলুন
https://drms-client.herokuapp.com

# Test login করুন:
# Email: head@school.com
# Password: password123
```

---

## 📱 Step 7: Android App এর জন্য Server URL Update করুন

Android app এ server URL update করুন:

**android/src/network/RetrofitClient.kt:**

```kotlin
const val BASE_URL = "https://drms-server.herokuapp.com/api/"
```

নতুন APK build এবং deploy করুন।

---

## 🔄 Step 8: Database Seeding (Optional)

যদি database seed করতে হয়:

```bash
cd server

# Manual seed করতে পারেন এই command দিয়ে:
# But Heroku তে এটা direct run করা যায় না।

# Instead, API endpoint দিয়ে seed করুন অথবা
# Mongo Atlas compass দিয়ে manually import করুন।
```

---

## 📊 Monitoring & Management

### Heroku Dashboard দিয়ে:

1. https://dashboard.heroku.com এ যান
2. আপনার apps দেখবেন
3. **Resources** → dyno status দেখুন
4. **Settings** → Environment variables manage করুন
5. **Activity** → Deployment history দেখুন

### Command line দিয়ে:

```bash
# All config variables দেখুন
heroku config

# Specific app এর জন্য:
heroku config -a drms-server

# Logs real-time দেখুন
heroku logs --tail

# App restart করুন
heroku restart

# Dyno type পরিবর্তন করুন (paid)
heroku dyno:type standard-1x -a drms-server
```

---

## 🛠️ Troubleshooting

### Issue 1: Build Failed

```bash
# Logs দেখুন
heroku logs --tail

# Clear buildpack cache
heroku plugins:install heroku-repo
heroku repo:purge_cache -a your-app-name

# Rebuild
git push heroku main
```

### Issue 2: MongoDB Connection Error

```bash
# MONGO_URI check করুন
heroku config -a drms-server

# MongoDB Atlas এ IP whitelist check করুন
# Must include: 0.0.0.0/0 or Heroku dynos' IP range
```

### Issue 3: CORS Errors

```bash
# Client logs দেখুন
heroku logs --tail -a drms-client

# Server এ FRONTEND_URL set করুন
heroku config:set FRONTEND_URL="https://your-client.herokuapp.com" -a drms-server
```

### Issue 4: Port Errors

```bash
# Server এ PORT environment variable auto-set হয় Heroku দ্বারা
# Your server.ts already handles it:
# const PORT = process.env.PORT || 5000;
```

---

## 🚀 Deployment Checklist

- [ ] MongoDB Atlas cluster তৈরি করেছি
- [ ] MongoDB User এবং connection string পেয়েছি
- [ ] Heroku CLI ইনস্টল এবং login করেছি
- [ ] Server app Heroku এ create করেছি
- [ ] Server environment variables set করেছি
- [ ] Server successfully deploy করেছি
- [ ] Client app Heroku এ create করেছি
- [ ] Client environment variables set করেছি
- [ ] Client successfully deploy করেছি
- [ ] CORS configuration verify করেছি
- [ ] Server URL test করেছি
- [ ] Client login test করেছি
- [ ] Android app server URL update করেছি

---

## 📝 Environment Variables Summary

### Server (.env Heroku):

```
NODE_ENV=production
PORT=5000 (auto-set by Heroku)
JWT_SECRET=your_secret_key
MONGO_URI=your_mongodb_atlas_uri
IMGBB_API_KEY=your_api_key
FRONTEND_URL=https://drms-client.herokuapp.com
```

### Client (.env.production):

```
NEXT_PUBLIC_API_URL=https://drms-server.herokuapp.com/api
```

---

## 🎯 Important URLs

- **Server Dashboard:** https://dashboard.heroku.com/apps/drms-server
- **Client Dashboard:** https://dashboard.heroku.com/apps/drms-client
- **Deployed Server:** https://drms-server.herokuapp.com
- **Deployed Client:** https://drms-client.herokuapp.com
- **MongoDB Atlas:** https://cloud.mongodb.com
- **Heroku Docs:** https://devcenter.heroku.com

---

## 🔐 Security Notes

1. **Never commit .env file to Git** ✅ (Already in .gitignore)
2. **Use strong JWT_SECRET** ✅ (Change the default)
3. **Use strong MongoDB password** ✅ (Change the default)
4. **Enable MongoDB IP whitelist** ✅ (Only allow specific IPs)
5. **Use HTTPS** ✅ (Heroku provides free SSL/TLS)
6. **Keep dependencies updated** - Regularly run `npm audit fix`

---

## 📞 Support Resources

- **Heroku Docs:** https://devcenter.heroku.com
- **MongoDB Atlas Docs:** https://docs.mongodb.com/atlas/
- **Express/Node Docs:** https://expressjs.com
- **Next.js Deployment:** https://nextjs.org/docs/deployment
- **Express Best Practices:** https://expressjs.com/en/advanced/best-practice-security.html

---

## ✨ You're All Set!

Congratulations! 🎉 আপনার DRMS application এখন production ready এবং Heroku এ deployed।

সফল deployment এর জন্য best wishes!

---

**Last Updated:** May 11, 2026
**Version:** 1.0
**Status:** Ready for Production Deployment 🚀
