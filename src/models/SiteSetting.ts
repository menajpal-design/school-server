import mongoose, { Document, Schema } from 'mongoose';

export interface ISiteSetting extends Document {
  key: string;
  value: any;
  isSecret: boolean;
  institutionId?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SiteSettingSchema = new Schema({
  key: { type: String, required: true, index: true, trim: true },
  value: { type: Schema.Types.Mixed, default: {} },
  isSecret: { type: Boolean, default: false },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', index: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

SiteSettingSchema.index({ key: 1, institutionId: 1 }, { unique: true });

export default mongoose.model<ISiteSetting>('SiteSetting', SiteSettingSchema);
