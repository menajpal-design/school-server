# Environment Configuration Guide

This document explains all environment variables used by the DRMS application.

## Quick Setup

### Option 1: Local Development (MongoDB Local)
```bash
# Copy example file
cp .env.example .env

# Update .env with local MongoDB
MONGO_URI=mongodb://localhost:27017/drms
MONGO_SSL=false
```

### Option 2: Cloud Development (MongoDB Atlas)
```bash
# Copy example file
cp .env.example .env

# Update .env with provided MongoDB Atlas credentials
MONGO_URI=mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0
MONGO_DB_NAME=documentwise_demo
MONGO_SSL=true
```

## Configuration Sections

### Server Configuration
```env
PORT=5000                      # Server port (default: 5000)
NODE_ENV=development           # Environment: development, production, test
```

### JWT Configuration
```env
JWT_SECRET=your_secret_key_32_chars_min    # Must be at least 32 characters
JWT_EXPIRE=7d                               # Token expiration (7 days)
```

### MongoDB Configuration

#### Local MongoDB
```env
MONGO_URI=mongodb://localhost:27017/drms
MONGO_SSL=false
MONGO_POOL_SIZE=10
```

#### MongoDB Atlas (Cloud)
```env
# Full connection string with all replicas
MONGO_URI=mongodb://school-multi:PASSWORD@host1:27017,host2:27017,host3:27017/?ssl=true&replicaSet=replica-set-name&authSource=admin&retryWrites=true&w=majority

MONGO_DB_NAME=documentwise_demo              # Database name
MONGO_REPLICA_SET=atlas-bcrchy-shard-0       # Replica set name
MONGO_SSL=true                                # Always true for Atlas
MONGO_POOL_SIZE=10                            # Connection pool size
MONGO_PERSISTENCE_ENABLED=true                # Keep connections alive
```

### Snapshots Configuration
```env
MONGO_SNAPSHOT_COLLECTION=app_snapshots      # Collection for snapshots
MONGO_SNAPSHOT_ID=documentwise-main           # Snapshot ID
```

### Image & Document Uploads
```env
IMGBB_API_KEY=4a9453f865d8fb428b0c5d17af69ade1    # ImgBB API key
UPLOAD_MAX_SIZE_MB=5                               # Max file size in MB
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,application/pdf
UPLOAD_PATH=uploads/                              # Local upload directory
```

**IMGBB Setup:**
1. Go to https://imgbb.com
2. Sign up for free account
3. Get API key from https://api.imgbb.com/
4. Set `IMGBB_API_KEY` in .env

### Email Configuration

#### Disabled (Default)
```env
EMAIL_ENABLED=false                 # Emails are disabled by default
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

#### Enable Email
```env
EMAIL_ENABLED=true                  # Enable email functionality

# SMTP Configuration
SMTP_HOST=smtp.gmail.com            # Gmail SMTP server
SMTP_PORT=587                       # SMTP port (TLS)
SMTP_USER=your_email@gmail.com      # Gmail address
SMTP_PASS=your_app_password         # App-specific password (not account password)
```

**Gmail Setup with App Password:**
1. Enable 2-Factor Authentication on Google Account
2. Go to https://myaccount.google.com/apppasswords
3. Select "Mail" and "Windows Computer"
4. Copy generated 16-character app password
5. Use this as `SMTP_PASS` (not your actual Gmail password)

### SMS Configuration

#### Disabled (Default)
```env
SMS_ENABLED=false                       # SMS is disabled by default
SMS_PROVIDER=twilio
SMS_ACCOUNT_SID=your_twilio_account_sid
SMS_AUTH_TOKEN=your_twilio_auth_token
SMS_PHONE_NUMBER=+1234567890
```

#### Enable SMS (Twilio)
```env
SMS_ENABLED=true                        # Enable SMS functionality
SMS_PROVIDER=twilio

# Twilio Credentials
SMS_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
SMS_AUTH_TOKEN=your_auth_token
SMS_PHONE_NUMBER=+1234567890            # Twilio phone number
```

**Twilio Setup:**
1. Sign up at https://www.twilio.com/
2. Verify your phone number
3. Get Account SID and Auth Token from Dashboard
4. Rent a phone number
5. Set SMS variables in .env

### Frontend URLs
```env
FRONTEND_URL=http://localhost:3000     # Web client URL
MOBILE_URL=http://localhost:8081       # Mobile app URL (for CORS)
```

## Environment-Specific Examples

### Development (.env)
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=dev_secret_key_with_32_characters_minimum_length
MONGO_URI=mongodb://localhost:27017/drms
MONGO_SSL=false
EMAIL_ENABLED=false
SMS_ENABLED=false
FRONTEND_URL=http://localhost:3000
MOBILE_URL=http://localhost:8081
```

### Production (.env)
```env
PORT=5000
NODE_ENV=production
JWT_SECRET=production_secret_key_very_long_and_random_32_characters_minimum
MONGO_URI=mongodb://user:pass@prod-db-host:27017,db-host2:27017,db-host3:27017/?ssl=true&replicaSet=rs0
MONGO_SSL=true
MONGO_POOL_SIZE=50
EMAIL_ENABLED=true
SMS_ENABLED=true
FRONTEND_URL=https://yourschool.com
MOBILE_URL=https://yourschool.com
```

## Validation Rules

The application validates configuration on startup:

| Setting | Requirement | Error if Invalid |
|---------|-------------|-----------------|
| JWT_SECRET | Min 32 characters | Exits in production, warns in dev |
| MONGO_URI | Must be set | Exits in production |
| EMAIL_ENABLED=true | SMTP_HOST, SMTP_PORT, EMAIL_USER, EMAIL_PASS | Warns in dev, exits in production |
| SMS_ENABLED=true | SMS_ACCOUNT_SID, SMS_AUTH_TOKEN, SMS_PHONE_NUMBER | Warns in dev, exits in production |

## Utility Files

### Email Service (`src/utils/email.ts`)
- `sendEmail(options)` - Send single email
- `sendBulkEmails(recipients, subject, html)` - Send bulk emails
- `sendIdCardEmail(email, name, pdfPath)` - Send ID card email
- `sendNotificationEmail(email, title, body)` - Send notification

### SMS Service (`src/utils/sms.ts`)
- `sendSMS(options)` - Send single SMS
- `sendBulkSMS(recipients, message)` - Send bulk SMS
- `sendAttendanceReminderSMS(phone, name)` - Attendance reminder
- `sendFeeDueSMS(phone, name, amount)` - Fee reminder

### Upload Service (`src/utils/upload.ts`)
- `validateFile(filename, size, mimeType)` - Validate before upload
- `uploadToImgBB(filePath)` - Upload to ImgBB
- `uploadLocally(filePath, filename)` - Upload locally
- `deleteUploadedFile(filename)` - Delete file
- `getFileInfo(filename)` - Get file details

### Configuration (`src/config/config.ts`)
- `getConfig()` - Get all configuration
- `config()` - Singleton config getter
- `validateConfig(config)` - Validate configuration

## Usage in Controllers

```typescript
import { config } from '../config/config';
import { sendEmail } from '../utils/email';
import { sendSMS } from '../utils/sms';

export const handleNotification = async (req, res) => {
  const appConfig = config();
  
  // Check if email is enabled
  if (appConfig.emailEnabled) {
    await sendEmail({
      to: req.body.email,
      subject: 'Notification',
      html: '<p>Your notification</p>'
    });
  }
  
  // Check if SMS is enabled
  if (appConfig.smsEnabled) {
    await sendSMS({
      to: req.body.phone,
      message: 'Your notification'
    });
  }
};
```

## Security Best Practices

1. **JWT_SECRET**: Use a random 32+ character string, not a simple password
2. **Database Credentials**: Never commit .env file to version control
3. **IMGBB_API_KEY**: Keep private, regenerate if exposed
4. **Email Password**: Use app-specific password, not account password
5. **SMS Credentials**: Keep Twilio credentials confidential
6. **NODE_ENV**: Set to 'production' in production environment

## Troubleshooting

### MongoDB Connection Failed
- Check MONGO_URI is correct
- For local: ensure MongoDB is running (`mongod` command)
- For Atlas: ensure IP is whitelisted in MongoDB Atlas dashboard

### Email Not Sending
- Check `EMAIL_ENABLED=true`
- Verify Gmail app password is correct (not account password)
- Check 2FA is enabled on Gmail account

### SMS Not Sending
- Check `SMS_ENABLED=true`
- Verify Twilio Account SID and Auth Token
- Verify phone number has correct country code

### Upload Failing
- Check `IMGBB_API_KEY` is valid
- Verify file size is under `UPLOAD_MAX_SIZE_MB`
- Verify file type is in `UPLOAD_ALLOWED_TYPES`
