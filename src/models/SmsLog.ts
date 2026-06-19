import mongoose, { Schema, Document } from 'mongoose';

export interface ISmsLog extends Document {
  institutionId: mongoose.Types.ObjectId;
  phoneNumber: string;
  recipientPhone?: string;
  recipientName: string;
  recipientId?: mongoose.Types.ObjectId;
  recipientType?: 'student' | 'teacher' | 'staff' | 'guardian' | 'parent' | 'other';
  message: string;
  type: 'attendance' | 'fee' | 'notice' | 'notification' | 'admission' | 'credentials' | 'monthly_parent' | 'other';
  purpose?: string;
  provider?: string;
  unitCharge?: number;
  chargeAmount?: number;
  status: 'sent' | 'failed' | 'pending' | 'delivered';
  studentId?: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;
  sentAt: Date;
  deliveredAt?: Date;
  failureReason?: string;
  errorMessage?: string;
  apiResponse?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SmsLogSchema = new Schema<ISmsLog>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    phoneNumber: { type: String, required: true },
    recipientPhone: { type: String },
    recipientName: { type: String, required: true },
    recipientId: { type: Schema.Types.ObjectId },
    recipientType: { type: String, enum: ['student', 'teacher', 'staff', 'guardian', 'parent', 'other'], default: 'other' },
    message: { type: String, required: true },
    type: { type: String, enum: ['attendance', 'fee', 'notice', 'notification', 'admission', 'credentials', 'monthly_parent', 'other'], default: 'notification' },
    purpose: { type: String },
    provider: { type: String },
    unitCharge: { type: Number, default: 0 },
    chargeAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['sent', 'failed', 'pending', 'delivered'], default: 'pending' },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Parent' },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    failureReason: { type: String },
    errorMessage: { type: String },
    apiResponse: { type: String },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

SmsLogSchema.pre('validate', function normalizeSmsLog(next) {
  const doc: any = this;
  if (!doc.phoneNumber && doc.recipientPhone) doc.phoneNumber = doc.recipientPhone;
  if (!doc.recipientPhone && doc.phoneNumber) doc.recipientPhone = doc.phoneNumber;
  if (!doc.purpose && doc.type) doc.purpose = doc.type;
  if (!doc.errorMessage && doc.failureReason) doc.errorMessage = doc.failureReason;
  if (!doc.expiresAt) {
    const expiresAt = new Date(doc.sentAt || Date.now());
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    doc.expiresAt = expiresAt;
  }
  next();
});

SmsLogSchema.index({ institutionId: 1, createdAt: -1 });
SmsLogSchema.index({ institutionId: 1, sentAt: -1 });
SmsLogSchema.index({ institutionId: 1, phoneNumber: 1 });
SmsLogSchema.index({ institutionId: 1, recipientPhone: 1 });
SmsLogSchema.index({ institutionId: 1, status: 1 });
SmsLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SmsLog = mongoose.models.SmsLog || mongoose.model<ISmsLog>('SmsLog', SmsLogSchema);

export default SmsLog;
