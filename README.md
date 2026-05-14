# easy school Backend Server

Distributed Records Management System - Express.js + MongoDB Backend

## Overview

The easy school backend provides a comprehensive REST API for school management including:
- User authentication and role-based permissions
- Student, teacher, and staff management
- Attendance tracking
- Academic results and exam management
- Financial management (fees and salary)
- ID card generation with QR codes
- Document management
- Notice board system
- Parent portal
- Committee management
- Comprehensive reporting and analytics

## Prerequisites

- Node.js 18+
- MongoDB 5+ (local or Atlas)
- npm or yarn

## Installation

1. **Clone or navigate to server folder:**
```bash
cd server
```

2. **Install dependencies:**
```bash
npm install
```

3. **Setup environment variables:**
Create a `.env` file in the server root:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/easy_school
MONGODB_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/easy_school

# JWT Authentication
JWT_SECRET=your_jwt_secret_key_min_32_chars_1234567890
JWT_EXPIRE=7d

# CORS
FRONTEND_URL=http://localhost:3000
MOBILE_URL=http://localhost:8081

# Email Configuration (Optional - for notifications)
EMAIL_ENABLED=false
EMAIL_FROM=noreply@easyschool.edu
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

## Heroku deployment note

If automatic mail is needed in production, set `EMAIL_ENABLED=true` and add `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` in Heroku config vars.

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Backup
BACKUP_DIR=./backups
```

## Project Structure

```
server/
├── src/
│   ├── app.ts              # Express app configuration
│   ├── server.ts           # Server entry point
│   ├── config/
│   │   ├── database.ts     # MongoDB connection
│   │   └── constants.ts    # App constants
│   ├── controllers/        # Request handlers
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API routes
│   ├── middleware/         # Custom middleware
│   ├── services/           # Business logic
│   ├── utils/              # Helper functions
│   ├── validators/         # Input validation
│   └── scripts/            # Database seeding, migrations
├── dist/                   # Compiled TypeScript
└── package.json
```

## Models

- **User**: Authentication users with roles
- **Institution**: School/institution configuration
- **Student**: Student records
- **Teacher**: Teacher records
- **Staff**: Support staff records
- **Parent**: Parent/guardian records
- **Class**: Class configuration
- **Section**: Class sections
- **Subject**: Course subjects
- **Attendance**: Student attendance records
- **Fee**: Student fee records
- **Salary**: Employee salary records
- **Exam**: Exam configuration
- **Result**: Exam results
- **IDCard**: Generated ID cards with QR
- **Notice**: Announcements and notices
- **Notification**: System notifications
- **Document**: File storage records
- **Committee**: Committee management
- **AuditLog**: Activity logging

## API Routes

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/profile` - Get logged-in user profile

### Dashboard
- `GET /api/dashboard/stats` - Statistics
- `GET /api/dashboard/summary` - Summary cards
- `GET /api/dashboard/charts` - Chart data
- `GET /api/dashboard/composition` - Institution composition

### Student Management
- `GET /api/students` - List all students
- `POST /api/students` - Create student
- `GET /api/students/:id` - Get student details
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Teacher Management
- `GET /api/teachers` - List all teachers
- `POST /api/teachers` - Create teacher
- `PUT /api/teachers/:id` - Update teacher

### Attendance
- `GET /api/attendance` - List attendance
- `POST /api/attendance` - Mark attendance
- `GET /api/attendance/reports` - Attendance reports

### Finance
- `GET /api/finance/fees` - List fees
- `POST /api/finance/fees` - Create fee record
- `GET /api/finance/salary` - Salary records
- `GET /api/finance/reports` - Financial reports

### Academic
- `GET /api/academic/classes` - List classes
- `GET /api/academic/subjects` - List subjects
- `GET /api/academic/exams` - List exams
- `GET /api/academic/results` - List results

### ID Cards
- `POST /api/id-cards/generate` - Generate ID card
- `POST /api/id-cards/bulk` - Bulk generate
- `GET /api/id-cards/:id/download` - Download card
- `POST /api/id-cards/:id/email` - Email card
- `POST /api/id-cards/verify` - Verify by QR

### Notices
- `GET /api/notices` - List notices
- `POST /api/notices` - Create notice
- `PUT /api/notices/:id` - Update notice
- `DELETE /api/notices/:id` - Delete notice

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Upload document
- `DELETE /api/documents/:id` - Delete document

### Users & Roles
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user

### Notifications
- `GET /api/notifications` - List notifications
- `POST /api/notifications/mark-read` - Mark as read
- `POST /api/notifications/mark-all` - Mark all read

### Committee
- `GET /api/committee` - List committees
- `POST /api/committee` - Create committee

### Parent Portal
- `GET /api/parent/children` - Get children
- `GET /api/parent/attendance/:id` - Child attendance
- `GET /api/parent/results/:id` - Child results

### Reports
- `GET /api/reports/attendance` - Attendance report
- `GET /api/reports/finance` - Financial report
- `GET /api/reports/academic` - Academic report

### Backup & Restore
- `POST /api/backup/create` - Create backup
- `GET /api/backup/list` - List backups
- `POST /api/backup/restore` - Restore backup

## Running

### Development
```bash
npm run dev
```
Server will start at `http://localhost:5000`

### Production Build
```bash
npm run build
npm start
```

### Database Seeding

First, ensure MongoDB is running. Then seed the database:

```bash
npm run seed
```

Or to use the complete seed with all demo data:
```bash
npx ts-node src/scripts/seedComplete.ts
```

**Demo Credentials After Seeding:**
- **Head**: head@easyschool.edu / admin123
- **Teacher**: john.smith@easyschool.edu / teacher123
- **Staff**: staff.admin@easyschool.edu / staff123
- **Student**: alice.brown@easyschool.edu / student123
- **Parent**: mr.david.brown@easyschool.edu / parent123

## Authentication

JWT tokens are used for authentication. The token is sent in the `Authorization` header:
```
Authorization: Bearer <token>
```

Tokens expire after 7 days (configurable).

## Role-Based Access Control

Roles and their default permissions:

### Head (Admin)
- Full access to all resources

### Assistant Head
- Manage assigned areas
- Generate ID cards
- Create and edit academic records
- Post notices

### Class Teacher
- Manage class attendance
- Manage class students
- View and create results

### Subject Teacher
- Manage results
- View attendance reports

### Finance Officer
- Manage all financial records
- View payment reports

### Staff
- Manage ID cards
- Generate reports

### Student
- View own records
- Download own ID card
- View results and notices

### Parent
- View child records
- Download child ID card
- View child attendance and results

### Committee Member
- Post notices
- View reports

## Testing

Run tests with:
```bash
npm test
```

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` in `.env`
- For Atlas, whitelist your IP

### Port Already in Use
```bash
# Find and kill process on port 5000
# On Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# On macOS/Linux:
lsof -i :5000
kill -9 <PID>
```

### JWT Secret Error
- Ensure `JWT_SECRET` is at least 32 characters
- Regenerate if needed

## Performance

- Database indexes on frequently queried fields
- Pagination implemented for large datasets
- Rate limiting on API endpoints
- Compression middleware enabled
- CORS configured for security

## Security

- Password hashing with bcryptjs (12 rounds)
- JWT token-based authentication
- Request validation with Joi
- SQL injection protection via Mongoose
- Rate limiting per IP
- CORS restrictions
- Helmet for security headers

## Contributing

Follow the existing code style and structure when adding features.

## License

ISC

## Support

For issues or questions, contact the development team.
