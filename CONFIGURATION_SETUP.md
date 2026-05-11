# Environment Configuration Setup - Summary

## 🎉 Configuration Complete!

Your DRMS server has been configured with MongoDB Atlas and additional services. Here's what was set up:

## ✅ What Changed

### 1. **Environment Variables (.env)**
- ✅ Updated `MONGO_URI` to MongoDB Atlas connection
- ✅ Added MongoDB Atlas configuration (SSL, replica set, pool size)
- ✅ Added snapshot collection configuration
- ✅ Updated IMGBB API key from your provided credentials
- ✅ Added upload configuration (5MB max, image/PDF support)
- ✅ Disabled EMAIL and SMS by default (can be enabled later)
- ✅ Added SMTP configuration template (Gmail compatible)
- ✅ Added Twilio SMS configuration template

### 2. **Database Configuration (`src/config/database.ts`)**
- ✅ Updated to use `MONGO_URI` environment variable
- ✅ Added MongoDB Atlas connection options (SSL, pool size, retry logic)
- ✅ Added detailed logging for connection status
- ✅ Proper error handling with exit code 1 on failure

### 3. **New Utility Files Created**

#### Email Service (`src/utils/email.ts`)
- Disabled by default (EMAIL_ENABLED=false)
- Ready to enable when needed
- Functions:
  - `sendEmail()` - Single email
  - `sendBulkEmails()` - Batch emails
  - `sendIdCardEmail()` - ID card delivery
  - `sendNotificationEmail()` - Notifications

#### SMS Service (`src/utils/sms.ts`)
- Disabled by default (SMS_ENABLED=false)
- Ready to enable with Twilio
- Functions:
  - `sendSMS()` - Single SMS
  - `sendBulkSMS()` - Batch SMS
  - `sendAttendanceReminderSMS()` - Attendance alerts
  - `sendFeeDueSMS()` - Fee reminders

#### Upload Service (`src/utils/upload.ts`)
- File validation
- IMGBB integration
- Local file handling
- MIME type checking

### 4. **Configuration Management (`src/config/config.ts`)**
- ✅ Centralized config getter with validation
- ✅ Type-safe configuration interface
- ✅ Singleton pattern for efficient config access
- ✅ Startup validation that warns in dev, exits in production

### 5. **Documentation**
- ✅ Updated `.env.example` with all new variables
- ✅ Created comprehensive `CONFIG_GUIDE.md` with setup instructions

## 📋 Current Environment Configuration

```env
# MongoDB Atlas (Ready to use)
MONGO_URI=mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,...
MONGO_DB_NAME=documentwise_demo
MONGO_SSL=true
MONGO_POOL_SIZE=10

# Image Upload (Ready to use)
IMGBB_API_KEY=4a9453f865d8fb428b0c5d17af69ade1
UPLOAD_MAX_SIZE_MB=5

# Email (Disabled - enable when needed)
EMAIL_ENABLED=false

# SMS (Disabled - enable when needed)
SMS_ENABLED=false
```

## 🚀 Next Steps

### Step 1: Start the Server
```bash
cd server
npm install
npm run dev
```

You should see:
```
✅ MongoDB Connected: ac-grnzgam-shard-00-00.eokx1rc.mongodb.net
📦 Database: documentwise_demo
🔒 SSL Enabled: true
```

### Step 2: Test Database Connection
```bash
# Run seed script to populate demo data
npx ts-node src/scripts/seedComplete.ts
```

### Step 3: Start Frontend (in new terminal)
```bash
cd client
npm install
npm run dev
```

### Step 4: Login with Demo Credentials
- Email: `head@easyschool.edu`
- Password: `admin123`

## 📧 Enable Email (Optional)

When ready to send real emails:

1. **Gmail Setup:**
   - Enable 2FA on Google Account
   - Go to https://myaccount.google.com/apppasswords
   - Generate app password
   - Update .env:
     ```env
     EMAIL_ENABLED=true
     SMTP_USER=your_email@gmail.com
     SMTP_PASS=your_app_password
     ```

2. **Other SMTP Providers:**
   - Update SMTP_HOST and SMTP_PORT for your provider
   - Test with `npm run test:email` (if configured)

## 📱 Enable SMS (Optional)

When ready to send SMS messages:

1. **Twilio Setup:**
   - Sign up at https://www.twilio.com/
   - Get Account SID and Auth Token
   - Rent a phone number
   - Update .env:
     ```env
     SMS_ENABLED=true
     SMS_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
     SMS_AUTH_TOKEN=your_auth_token
     SMS_PHONE_NUMBER=+1234567890
     ```

## 🔧 Using Services in Controllers

### Send Email
```typescript
import { sendEmail } from '../utils/email';

await sendEmail({
  to: 'student@school.edu',
  subject: 'Your ID Card',
  html: '<p>Your ID card is ready</p>'
});
```

### Send SMS
```typescript
import { sendSMS } from '../utils/sms';

await sendSMS({
  to: '+8801700000000',
  message: 'Attendance reminder for today'
});
```

### Upload Image
```typescript
import { uploadToImgBB, validateFile } from '../utils/upload';

const validation = validateFile('image.jpg', fileSize, 'image/jpeg');
if (validation.valid) {
  const result = await uploadToImgBB(filePath);
  if (result.success) {
    console.log('Image URL:', result.url);
  }
}
```

### Get Configuration
```typescript
import { config } from '../config/config';

const appConfig = config();
console.log('Max upload size:', appConfig.uploadMaxSizeMB);
```

## 📚 File Structure

```
server/
├── .env                              # ✅ Updated with MongoDB Atlas
├── .env.example                      # ✅ Updated with all variables
├── CONFIG_GUIDE.md                   # ✅ Comprehensive configuration guide
├── src/
│   ├── config/
│   │   ├── database.ts              # ✅ Updated for MongoDB Atlas
│   │   ├── config.ts                # ✅ New - configuration management
│   │   └── ...
│   ├── utils/
│   │   ├── email.ts                 # ✅ New - email service
│   │   ├── sms.ts                   # ✅ New - SMS service
│   │   ├── upload.ts                # ✅ New - file upload service
│   │   ├── index.ts                 # ✅ New - utilities export
│   │   └── ...
│   └── ...
└── ...
```

## ✅ Validation & Error Handling

The configuration validates on startup:

| Setting | Check | Action if Invalid |
|---------|-------|------------------|
| JWT_SECRET | Min 32 chars | Warn (dev), Exit (prod) |
| MONGO_URI | Must exist | Exit always |
| EMAIL config | Validate if enabled | Warn (dev), Exit (prod) |
| SMS config | Validate if enabled | Warn (dev), Exit (prod) |

## 🔒 Security Notes

1. **Never commit .env** - Already in .gitignore
2. **Rotate JWT_SECRET** - Use 32+ random characters
3. **Email passwords** - Use app-specific password for Gmail, not account password
4. **SMS tokens** - Keep Twilio credentials secret
5. **IMGBB key** - Can be rotated in ImgBB dashboard

## 🐛 Troubleshooting

### MongoDB Connection Failed
```
Error: connect ECONNREFUSED
```
- MongoDB Atlas URL is correct
- Check IP whitelist in MongoDB Atlas dashboard

### Email Not Sending
```
Error: Invalid login
```
- Check SMTP_USER and SMTP_PASS
- Gmail requires app password (not account password)
- Verify 2FA is enabled

### File Upload Error
```
Error: File size exceeds limit
```
- Check UPLOAD_MAX_SIZE_MB setting
- File size must be under limit

## 📞 Support

For detailed configuration help, see: `CONFIG_GUIDE.md`

---

**Status**: ✅ Ready for Development
**Database**: MongoDB Atlas
**Email**: Disabled (Can be enabled)
**SMS**: Disabled (Can be enabled)
**Uploads**: IMGBB enabled
