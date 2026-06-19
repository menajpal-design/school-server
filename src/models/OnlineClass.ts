import mongoose, { Document, Schema } from 'mongoose';

export interface IOnlineClass extends Document {
  title: string;
  className?: string;
  subjectName?: string;
  teacherName?: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  videoUrl: string;
  description?: string;
  isPublished: boolean;
  createdBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OnlineClassSchema = new Schema({
  title: { type: String, required: true, trim: true },
  className: { type: String, trim: true },
  subjectName: { type: String, trim: true },
  teacherName: { type: String, trim: true },
  day: { type: String, trim: true },
  startTime: { type: String, trim: true },
  endTime: { type: String, trim: true },
  videoUrl: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  isPublished: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
}, { timestamps: true });

OnlineClassSchema.index({ institutionId: 1, className: 1, subjectName: 1, day: 1 });
OnlineClassSchema.index({ institutionId: 1, isPublished: 1 });

export interface IOnlineBook extends Document {
  title: string;
  className?: string;
  subjectName?: string;
  author?: string;
  driveUrl: string;
  thumbnail?: string;
  description?: string;
  isPublished: boolean;
  createdBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OnlineBookSchema = new Schema({
  title: { type: String, required: true, trim: true },
  className: { type: String, trim: true },
  subjectName: { type: String, trim: true },
  author: { type: String, trim: true },
  driveUrl: { type: String, required: true, trim: true },
  thumbnail: { type: String, trim: true, maxlength: 90000 },
  description: { type: String, trim: true },
  isPublished: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
}, { timestamps: true });

OnlineBookSchema.index({ institutionId: 1, className: 1, subjectName: 1 });
OnlineBookSchema.index({ institutionId: 1, isPublished: 1 });

export const OnlineBook = mongoose.model<IOnlineBook>('OnlineBook', OnlineBookSchema);
export default mongoose.model<IOnlineClass>('OnlineClass', OnlineClassSchema);
