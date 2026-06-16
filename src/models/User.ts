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
  gender?: 'male' | 'female' | 'other';
  fatherName?: string;
  motherName?: string;
  address?: string;
  bloodGroup?: string;
  fingerprintId?: string;
  biometricId?: string;
  isActive: boolean;
  lastLogin?: Date;
  permissions: string[];
  institutionId: mongoose.Types.ObjectId;
  resetPasswordCode?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, sparse: true, lowercase: true, trim: true },
  email: { type: String, sparse: true, lowercase: true, trim: true },
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
  gender: { type: String, enum: ['male', 'female', 'other'] },
  fingerprintId: { type: String, trim: true, sparse: true },
  biometricId: { type: String, trim: true, sparse: true },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  permissions: [{ type: String }],
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Store refresh tokens for session management (hashed)
UserSchema.add({
  refreshTokens: [{
    tokenHash: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date }
  }],
  resetPasswordCode: { type: String },
  resetPasswordExpires: { type: Date }
});

// Index for better query performance
UserSchema.index({ email: 1, institutionId: 1 }, { unique: true, sparse: true });
UserSchema.index({ username: 1, institutionId: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1, institutionId: 1 });
UserSchema.index({ fingerprintId: 1, institutionId: 1 }, { sparse: true });
UserSchema.index({ biometricId: 1, institutionId: 1 }, { sparse: true });

const dropLegacy = () => {
  const col = mongoose.connection.collection('users');
  col.dropIndex('email_1').catch(() => {});
  col.dropIndex('username_1').catch(() => {});
};

if (mongoose.connection) {
  if (mongoose.connection.readyState === 1) {
    process.nextTick(dropLegacy);
  } else {
    mongoose.connection.on('open', dropLegacy);
  }
}

export default mongoose.model<IUser>('User', UserSchema);
