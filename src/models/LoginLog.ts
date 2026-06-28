import mongoose, { Document, Schema } from 'mongoose';

export interface ILoginLog extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  name: string;
  username?: string;
  email?: string;
  role: string;
  ip?: string;
  userAgent?: string;
  loginAt: Date;
}

const LoginLogSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  name: { type: String, required: true },
  username: { type: String },
  email: { type: String },
  role: { type: String, required: true, index: true },
  ip: { type: String },
  userAgent: { type: String },
  loginAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

// Auto-delete logs older than 90 days
LoginLogSchema.index({ loginAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
LoginLogSchema.index({ institutionId: 1, loginAt: -1 });

export default mongoose.model<ILoginLog>('LoginLog', LoginLogSchema);
