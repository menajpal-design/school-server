# 🚀 Quick Setup Reference

## Current Configuration Status

```
Database:        ✅ MongoDB Atlas Connected
Image Upload:    ✅ IMGBB Ready (4a9453f865d8fb428b0c5d17af69ade1)
Email Service:   ⏸️  Disabled (Ready to enable)
SMS Service:     ⏸️  Disabled (Ready to enable)
JWT:             ✅ Configured (7-day expiry)
```

## 📦 MongoDB Connection

**Current:** MongoDB Atlas
```
Host: ac-grnzgam-shard-00-00.eokx1rc.mongodb.net
Database: documentwise_demo
Replica Set: atlas-bcrchy-shard-0
SSL: Enabled
```

**Test Connection:**
```bash
npm run test:db  # If you create this script
```

## 🔑 Critical Environment Variables

```env
# Must have (in .env)
MONGO_URI=mongodb://school-multi:...@ac-grnzgam...
JWT_SECRET=your_secret_key_32_chars_minimum
PORT=5000

# Image Upload (Already configured)
IMGBB_API_KEY=4a9453f865d8fb428b0c5d17af69ade1

# Optional - Email
# EMAIL_ENABLED=true              # Set to enable
# SMTP_USER=your_email@gmail.com
# SMTP_PASS=your_app_password

# Optional - SMS
# SMS_ENABLED=true                # Set to enable
# SMS_ACCOUNT_SID=AC...
# SMS_AUTH_TOKEN=...
```

## 📝 File Locations

| File | Purpose | Status |
|------|---------|--------|
| `.env` | Environment variables | ✅ Ready |
| `.env.example` | Template | ✅ Updated |
| `src/config/database.ts` | MongoDB connection | ✅ Updated |
| `src/config/config.ts` | Config management | ✅ New |
| `src/utils/email.ts` | Email service | ✅ New |
| `src/utils/sms.ts` | SMS service | ✅ New |
| `src/utils/upload.ts` | File upload | ✅ New |
| `CONFIG_GUIDE.md` | Detailed guide | ✅ New |
| `CONFIGURATION_SETUP.md` | Setup summary | ✅ New |

## 🔧 Quick Commands

### Start Development
```bash
# Terminal 1: Backend
cd server
npm run dev

# Terminal 2: Frontend
cd client
npm run dev

# Terminal 3: Mobile (Optional)
cd android
npm start
```

### Seed Database
```bash
cd server
npx ts-node src/scripts/seedComplete.ts
```

### Test API
```bash
# Get dashboard stats
curl http://localhost:5000/api/dashboard/stats

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"head@easyschool.edu","password":"admin123"}'
```

## 📊 Demo Credentials

After seeding, use these:

```
Head:    head@easyschool.edu / admin123
Teacher: john.smith@easyschool.edu / teacher123
Staff:   staff.admin@easyschool.edu / staff123
Student: alice.brown@easyschool.edu / student123
Parent:  mr.david.brown@easyschool.edu / parent123
```

## 🔐 Enable Features

### Step 1: Enable Email
```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password    # From Gmail app passwords
```

### Step 2: Enable SMS
```env
SMS_ENABLED=true
SMS_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
SMS_AUTH_TOKEN=your_token
SMS_PHONE_NUMBER=+1234567890   # Twilio number
```

### Step 3: Restart Server
```bash
npm run dev
```

## ⚠️ Important Notes

1. **JWT_SECRET must be 32+ characters** - Change from default
2. **Email uses app password** - Not your Gmail password
3. **SMS requires Twilio account** - Free trial available
4. **Never commit .env file** - Use .env.example for template
5. **MongoDB Atlas whitelist** - Add your IP address

## 📱 Mobile Setup

```env
# In android/.env
EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api
```

For physical devices:
```env
EXPO_PUBLIC_API_URL=http://192.168.1.X:5000/api  # Your machine IP
```

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| MongoDB connection fails | Check MONGO_URI, IP whitelist in Atlas |
| Email not sending | Verify SMTP_PASS is app password (not account password) |
| SMS not working | Check Twilio balance and SMS_ENABLED=true |
| File upload fails | Check IMGBB_API_KEY and file size < 5MB |
| Port already in use | Kill process: `netstat -ano \| findstr :5000` |

## 📚 Documentation

- **Detailed Config**: See `CONFIG_GUIDE.md`
- **Setup Steps**: See `CONFIGURATION_SETUP.md`
- **API Docs**: See `README.md`
- **Backend Details**: See `src/config/` and `src/utils/`

---

**Version**: 1.0  
**Last Updated**: May 10, 2026  
**Status**: ✅ Ready to Use
