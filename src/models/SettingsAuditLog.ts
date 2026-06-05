import mongoose, { Document, Schema } from 'mongoose';

export interface ISettingsAuditLog extends Document {
  settingKey: string;
  action: 'read' | 'update';
  changedBy: mongoose.Types.ObjectId;
  institutionId?: mongoose.Types.ObjectId;
  role?: string;
  changedFields: string[];
  createdAt: Date;
}

const SettingsAuditLogSchema = new Schema({
  settingKey: { type: String, required: true, index: true },
  action: { type: String, enum: ['read', 'update'], required: true, index: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', index: true },
  role: { type: String, trim: true },
  changedFields: [{ type: String, trim: true }],
}, { timestamps: true });

SettingsAuditLogSchema.index({ institutionId: 1, settingKey: 1, createdAt: -1 });

export default mongoose.model<ISettingsAuditLog>('SettingsAuditLog', SettingsAuditLogSchema);
