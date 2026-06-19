import mongoose, { Document, Schema } from 'mongoose';

export type OnlineClassMode = 'routine' | 'recorded' | 'schedule' | 'books';

export interface IOnlineClassResource extends Document {
  mode: OnlineClassMode;
  title: string;
  className?: string;
  subject?: string;
  teacher?: string;
  date?: string;
  time?: string;
  day?: string;
  link?: string;
  description?: string;
  thumbnail?: string;
  thumbnailSizeKb?: number;
  createdBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OnlineClassResourceSchema = new Schema({
  mode: { type: String, enum: ['routine', 'recorded', 'schedule', 'books'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  className: { type: String, trim: true, maxlength: 80 },
  subject: { type: String, trim: true, maxlength: 120 },
  teacher: { type: String, trim: true, maxlength: 120 },
  date: { type: String, trim: true, maxlength: 30 },
  time: { type: String, trim: true, maxlength: 60 },
  day: { type: String, trim: true, maxlength: 40 },
  link: { type: String, trim: true, maxlength: 1000 },
  description: { type: String, trim: true, maxlength: 3000 },
  thumbnail: { type: String, default: '' },
  thumbnailSizeKb: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
}, { timestamps: true });

OnlineClassResourceSchema.index({ institutionId: 1, mode: 1, createdAt: -1 });
OnlineClassResourceSchema.index({ institutionId: 1, className: 1, subject: 1 });

export default mongoose.model<IOnlineClassResource>('OnlineClassResource', OnlineClassResourceSchema);
