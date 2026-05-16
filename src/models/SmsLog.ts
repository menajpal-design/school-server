import mongoose, { Document, Schema } from 'mongoose';

export type SmsDeliveryStatus = 'sent' | 'failed' | 'pending';
export type SmsRecipientType = 'student' | 'parent' | 'teacher' | 'staff' | 'guardian' | 'other';

export interface ISmsLog extends Document {
  institutionId: mongoose.Types.ObjectId;
  senderId?: mongoose.Types.ObjectId;
  recipientId?: mongoose.Types.ObjectId;
  recipientType: SmsRecipientType;
  recipientName: string;
  recipientPhone: string;
  message: string;
  purpose?: string;
  provider?: string;
  status: SmsDeliveryStatus;
  sentAt: Date;
  expiresAt: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const addOneMonth = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date;
};

const SmsLogSchema: Schema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User' },
  recipientId: { type: Schema.Types.ObjectId },
  recipientType: {
    type: String,
    enum: ['student', 'parent', 'teacher', 'staff', 'guardian', 'other'],
    default: 'guardian',
  },
  recipientName: { type: String, required: true, trim: true },
  recipientPhone: { type: String, required: true, trim: true, index: true },
  message: { type: String, required: true, trim: true },
  purpose: { type: String, trim: true },
  provider: { type: String, trim: true },
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    default: 'sent',
    index: true,
  },
  sentAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, default: addOneMonth, index: { expires: 0 } },
  errorMessage: { type: String, trim: true },
}, {
  timestamps: true,
});

SmsLogSchema.index({ institutionId: 1, sentAt: -1 });
SmsLogSchema.index({ institutionId: 1, status: 1, sentAt: -1 });

export default mongoose.model<ISmsLog>('SmsLog', SmsLogSchema);
