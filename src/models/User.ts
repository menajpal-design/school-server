import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'head' | 'assistant_head' | 'class_teacher' | 'subject_teacher' | 'finance_officer' | 'staff' | 'student' | 'parent' | 'committee_member';
  phone?: string;
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  permissions: string[];
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
    required: true
  },
  phone: { type: String, trim: true },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  permissions: [{ type: String }],
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Index for better query performance
UserSchema.index({ email: 1, institutionId: 1 });
UserSchema.index({ role: 1, institutionId: 1 });

export default mongoose.model<IUser>('User', UserSchema);