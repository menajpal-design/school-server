# Email System Setup Guide

## Heroku SendGrid Addon (Recommended for Production)

Email sending is currently disabled by default. Messages will still save to the in-app inbox, and external email can be re-enabled later by setting `ENABLE_EMAIL_NOTIFICATIONS=true`.

### 1. Add SendGrid to Heroku

```bash
heroku addons:create sendgrid:starter -a school-server
```

This automatically sets environment variables on Heroku:
- `SENDGRID_USERNAME`
- `SENDGRID_PASSWORD`

### 2. Verify Setup

```bash
heroku config -a school-server | grep SENDGRID
```

You should see the SENDGRID credentials.

### 3. Optional: Configure Email Address

By default, SendGrid uses a noreply email. To customize:

```bash
heroku config:set EMAIL_FROM="noreply@yourdomain.com" -a school-server
```

---

## Local Development Setup (Alternative)

If you want to test locally without SendGrid addon, use a test SMTP service:

### Option A: Ethereal Email (Free Test Service)

The code already has fallback support. For local testing:

```bash
# No setup needed - emailService.ts will auto-create Ethereal test account
npm run dev
```

### Option B: Use Your Own SMTP

Set these environment variables in `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

For Gmail, use [App Passwords](https://myaccount.google.com/apppasswords).

---

## API Endpoints

### Send Message

**POST** `/api/messages/send`

```json
{
  "toUserId": "student_id",
  "toUserEmail": "student@school.edu",
  "toUserName": "Student Name",
  "subject": "Assignment Submission",
  "body": "Please submit your assignment by Friday.",
  "sendAsEmail": true
}
```

### Get Inbox

**GET** `/api/messages/inbox`

Returns array of received messages with unread count.

### Get Sent

**GET** `/api/messages/sent`

### Mark as Read

**PATCH** `/api/messages/:id/read`

### Get Unread Count

**GET** `/api/messages/stats/unread`

---

## Usage Examples

### From Teacher to Student

```typescript
// Send email assignment
await api.messages.send({
  toUserId: student._id,
  toUserEmail: student.email,
  toUserName: student.name,
  subject: 'New Assignment Posted',
  body: 'Mathematics Chapter 5 has been assigned. Due date: Friday.',
  sendAsEmail: true, // Send as external email
});
```

### Internal Notification

```typescript
// Send internal message (in-app only, no external email)
await api.messages.send({
  toUserId: staff._id,
  toUserEmail: staff.email,
  toUserName: staff.name,
  subject: 'Attendance Report Ready',
  body: 'Your monthly attendance report is ready for review.',
  sendAsEmail: false, // Only in-app
});
```

---

## Email Send Status

- **messageType**: `'email'`, `'internal'`, `'notification'`
- **folder**: `'inbox'`, `'sent'`, `'trash'` (for in-app tracking)
- **isRead**: boolean (auto-set when recipient views message)

---

## Troubleshooting

### Emails not sending

1. Check Heroku logs: `heroku logs -t -a school-server`
2. Verify SendGrid addon: `heroku addons -a school-server`
3. Test email sending: Use the `/api/messages/send` endpoint

### Local testing

If using Ethereal in development, check console output for preview URL:

```
📧 Email sent: <1234567890@ethereal.email>
Preview URL: https://ethereal.email/message/...
```

---

## Production Checklist

- [ ] SendGrid addon added: `heroku addons:create sendgrid:starter`
- [ ] Environment variables verified
- [ ] Test email sent successfully via `/api/messages/send`
- [ ] Client UI created for inbox/messaging (to be implemented)
- [ ] Email templates customized if needed
- [ ] Rate limiting configured for `/api/messages/send`
