import mongoose, { Schema, Document } from 'mongoose';

export interface ISmsLog extends Document {
  institutionId: mongoose.Types.ObjectId;
  phoneNumber: string;
  recipientName: string; // Parent name or contact person name
  message: string;
  type: 'attendance' | 'fee' | 'notice' | 'notification' | 'other';
  status: 'sent' | 'failed' | 'pending' | 'delivered';
  studentId?: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;
  sentAt: Date;
  deliveredAt?: Date;
  failureReason?: string;
  apiResponse?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SmsLogSchema = new Schema<ISmsLog>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    recipientName: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['attendance', 'fee', 'notice', 'notification', 'other'],
      default: 'notification',
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'pending', 'delivered'],
      default: 'pending',
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Parent',
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    deliveredAt: {
      type: Date,
    },
    failureReason: {
      type: String,
    },
    apiResponse: {
      type: String,
    },
  },
  { timestamps: true }
);

// Index for efficient querying
SmsLogSchema.index({ institutionId: 1, createdAt: -1 });
SmsLogSchema.index({ institutionId: 1, parentId: 1 });
SmsLogSchema.index({ institutionId: 1, status: 1 });

const SmsLog = mongoose.model<ISmsLog>('SmsLog', SmsLogSchema);

export default SmsLog;
