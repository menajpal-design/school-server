import mongoose, { Document, Schema } from 'mongoose';

export interface IPageView extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  name?: string;
  username?: string;
  role: string;
  path: string;
  title?: string;
  referrer?: string;
  ip?: string;
  userAgent?: string;
  viewedAt: Date;
}

const PageViewSchema = new Schema<IPageView>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  name: { type: String },
  username: { type: String },
  role: { type: String, required: true, index: true },
  path: { type: String, required: true, trim: true, index: true },
  title: { type: String, trim: true },
  referrer: { type: String, trim: true },
  ip: { type: String },
  userAgent: { type: String },
  viewedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

PageViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
PageViewSchema.index({ institutionId: 1, viewedAt: -1 });
PageViewSchema.index({ institutionId: 1, path: 1, viewedAt: -1 });

export default mongoose.model<IPageView>('PageView', PageViewSchema);
