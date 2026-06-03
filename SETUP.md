# easy school Server Setup & Configuration Guide

Complete setup guide for the easy school Backend Server with MongoDB, Email, SMS, and file upload services.

## Quick Start

### Option 1: Local Development
```bash
# Install dependencies
npm install

# Copy example configuration
cp .env.example .env

# Update .env with local MongoDB
# MONGO_URI=mongodb://localhost:27017/easy_school
# MONGO_SSL=false

# Seed demo data
npm run seed

# Start development server
npm run dev
```

### Option 2: Production with MongoDB Atlas
```bash
# Install dependencies
npm install

# Copy and update .env with MongoDB Atlas credentials
cp .env.example .env

# Start server
npm run dev  # or npm start for production build
```

## Environment Configuration

### Server Settings
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
MONGO_URI=mongodb://localhost:27017/easy_school
MONGO_SSL=false
MONGO_POOL_SIZE=10
```

#### MongoDB Atlas (Cloud)
```env
MONGO_URI=mongodb://user:pass@host1:27017,host2:27017,host3:27017/?ssl=true&replicaSet=replica-set-name&authSource=admin&retryWrites=true&w=majority
MONGO_DB_NAME=documentwise_demo
MONGO_REPLICA_SET=atlas-replica-set-name
MONGO_SSL=true
MONGO_POOL_SIZE=10
MONGO_PERSISTENCE_ENABLED=true
```

### File Upload Configuration
```env
UPLOAD_MAX_SIZE_MB=5                         # Max file size in MB
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,application/pdf
UPLOAD_PATH=uploads/                         # Local upload directory
```

### Email Configuration (Optional)
```env
EMAIL_ENABLED=true                           # Enable email functionality

# SMTP Settings (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password                  # Use app-specific password, not account password
```

**Gmail Setup:**
1. Enable 2-Factor Authentication
2. Go to https://myaccount.google.com/apppasswords
3. Select "Mail" and "Windows Computer"
4. Copy the 16-character app password
5. Use as `SMTP_PASS`

### SMS Configuration (Optional)
```env
SMS_ENABLED=true
SMS_PROVIDER=twilio                          # twilio or anoncify

# Twilio
SMS_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
SMS_AUTH_TOKEN=your_auth_token
SMS_PHONE_NUMBER=+1234567890

# OR Anoncify
SMS_API_KEY=your_anoncify_api_key
SMS_API_URL=https://anoncify.xyz/api/sms
```

### Frontend URLs
```env
FRONTEND_URL=http://localhost:3000           # Web client URL
MOBILE_URL=http://localhost:8081             # Mobile app URL
ANDROID_URL=http://localhost:8082            # Android app URL
ALLOWED_ORIGINS=                              # Comma-separated additional origins
```

## Project Structure

```
src/
├── app.ts                      # Express app configuration
├── server.ts                   # Server entry point
├── config/
│   ├── config.ts              # Configuration management
│   └── database.ts            # MongoDB connection
├── controllers/               # Request handlers
├── routes/                    # API routes
├── models/                    # Mongoose schemas
├── services/                  # Business logic
├── utils/
│   ├── email.ts              # Email sending
│   ├── sms.ts                # SMS sending
│   └── upload.ts             # File upload handling
├── types/                     # TypeScript types
└── validators/                # Input validation
```

## Available Scripts

```bash
npm run dev              # Start with hot reload (ts-node-dev)
npm start               # Start production build
npm run build           # Compile TypeScript
npm run seed            # Seed complete demo data
npm run seed:quick      # Seed minimal test data
npm run seed:complete   # Seed extensive data
npm run monthly-sms     # Send monthly guardian SMS
npm run test            # Run tests
```

## API Endpoints

### Core Routes
- `/api/health` - Health check
- `/api/auth/*` - Authentication (login, register, refresh token)
- `/api/config/*` - Configuration endpoints
- `/api/seed/*` - Database seeding

### Resource Routes
- `/api/users/*` - User management
- `/api/students/*` - Student records
- `/api/teachers/*` - Teacher records
- `/api/staff/*` - Staff management
- `/api/academic/*` - Academic information
- `/api/attendance/*` - Attendance tracking
- `/api/finance/*` - Finance & fees
- `/api/documents/*` - Document management
- `/api/notices/*` - Notice board
- `/api/id-cards/*` - ID card generation
- `/api/dashboard/*` - Dashboard data
- `/api/notifications/*` - Notifications
- `/api/committee/*` - Committee management
- `/api/parent/*` - Parent portal

## Demo Credentials

After seeding, use these credentials:

```
Head/Admin:
  Email: head@demoschool.edu
  Password: admin123

Teacher:
  Email: teacher@demoschool.edu
  Password: teacher123

Student:
  Email: student@demoschool.edu
  Password: student123
```

## Services

### Email Service
- Disabled by default
- Supports single and bulk emails
- Template-based sending
- Error handling with retry logic

### SMS Service
- Disabled by default
- Supports Twilio and Anoncify providers
- Bulk SMS capability
- Attendance and fee reminders

### File Upload Service
- Local filesystem storage
- File validation
- Size and type restrictions

## Troubleshooting

### MongoDB Connection Issues
```
If "MongoDB Connection Error" appears:
1. Check MONGO_URI is correct
2. Verify MongoDB is running (local or Atlas accessible)
3. Check network connectivity
4. Verify username/password if using credentials
```

### Email Not Sending
```
If emails don't send:
1. Set EMAIL_ENABLED=true
2. Verify SMTP credentials
3. Check Gmail app password (not account password)
4. Check SMTP_HOST and SMTP_PORT
```

### SMS Not Sending
```
If SMS doesn't send:
1. Set SMS_ENABLED=true
2. Verify SMS_PROVIDER is set correctly
3. Check API credentials (Twilio or Anoncify)
4. Ensure phone numbers are in E.164 format
```

## Performance Tips

- Use MongoDB connection pooling (MONGO_POOL_SIZE)
- Enable MONGO_PERSISTENCE_ENABLED for Atlas
- Set rate limiting appropriately
- Use compression middleware
- Cache responses when possible

## Security Best Practices

- Use environment variables for all secrets
- Never commit .env file
- Use HTTPS in production
- Rotate JWT_SECRET regularly
- Use strong passwords (32+ chars for JWT_SECRET)
- Enable CORS selectively
- Rate limit API endpoints
- Validate all input
