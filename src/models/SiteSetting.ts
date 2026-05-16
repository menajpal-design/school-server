import mongoose, { Document, Schema } from 'mongoose';

export interface ISiteSetting extends Document {
  key: string;
  value: any;
  isSecret: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SiteSettingSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true, trim: true },
  value: { type: Schema.Types.Mixed, default: {} },
  isSecret: { type: Boolean, default: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model<ISiteSetting>('SiteSetting', SiteSettingSchema);
