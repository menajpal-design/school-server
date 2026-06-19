import mongoose, { Document, Schema } from 'mongoose';

export interface ISmsTopup extends Document {
  institutionId: mongoose.Types.ObjectId;
  amount: number;
  currency?: string;
  method?: string;
  meta?: Record<string, any>;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const SmsTopupSchema: Schema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: process.env.SMS_CURRENCY || 'BDT' },
  method: { type: String },
  meta: { type: Schema.Types.Mixed },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model<ISmsTopup>('SmsTopup', SmsTopupSchema);
