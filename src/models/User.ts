import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  username?: string;
  email?: string;
  password: string;
  role: 'admin' | 'super_admin' | 'head' | 'assistant_head' | 'class_teacher' | 'subject_teacher' | 'teacher' | 'finance_officer' | 'staff' | 'student' | 'parent' | 'committee_member';
  phone?: string;
  avatar?: string;
  dateOfBirth?: Date;
  fatherName?: string;
  motherName?: string;
  address?: string;
  bloodGroup?: string;
  isActive: boolean;
  lastLogin?: Date;
  permissions: string[];
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'super_admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
    required: true
  },
  phone: { type: String, trim: true },
  avatar: { type: String },
  dateOfBirth: { type: Date },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  address: { type: String, trim: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  permissions: [{ type: String }],
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Index for better query performance
UserSchema.index({ email: 1, institutionId: 1 }, { sparse: true });
UserSchema.index({ username: 1, institutionId: 1 });
UserSchema.index({ role: 1, institutionId: 1 });

export default mongoose.model<IUser>('User', UserSchema);