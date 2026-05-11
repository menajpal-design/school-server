import mongoose, { Document, Schema } from 'mongoose';

export interface INotice extends Document {
  title: string;
  content: string;
  category: 'general' | 'academic' | 'finance' | 'event' | 'urgent';
  priority: 'low' | 'medium' | 'high';
  urgent: boolean;
  targetAudience: 'all' | 'class' | 'role' | 'parent' | 'staff';
  attachments?: mongoose.Types.ObjectId[];
  postedBy: mongoose.Types.ObjectId;
  targetRoles: string[];
  targetClasses?: mongoose.Types.ObjectId[];
  isPublished: boolean;
  publishedAt?: Date;
  expiryDate?: Date;
  views: number;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NoticeSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  category: { type: String, enum: ['general', 'academic', 'finance', 'event', 'urgent'], default: 'general' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  urgent: { type: Boolean, default: false },
  targetAudience: { type: String, enum: ['all', 'class', 'role', 'parent', 'staff'], default: 'all' },
  attachments: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
  postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetRoles: [{ type: String }],
  targetClasses: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date },
  expiryDate: { type: Date },
  views: { type: Number, default: 0 },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
NoticeSchema.index({ isPublished: 1, publishedAt: -1 });
NoticeSchema.index({ category: 1, isPublished: 1 });
NoticeSchema.index({ institutionId: 1, isPublished: 1 });

export default mongoose.model<INotice>('Notice', NoticeSchema);
