// File Location: school-server/src/models/Staff.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IStaff extends Document {
  userId: mongoose.Types.ObjectId;
  employeeId: string;
  designation: string;
  department: string;
  joiningDate: Date;
  salary: number;
  isActive: boolean;
  idCardNumber?: string;
  idCardExpiry?: Date;
  fingerprintId?: string;
  biometricId?: string;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  employeeId: { type: String, required: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  joiningDate: { type: Date, required: true },
  salary: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  idCardNumber: { type: String },
  idCardExpiry: { type: Date },
  fingerprintId: { type: String, trim: true, sparse: true },
  biometricId: { type: String, trim: true, sparse: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
StaffSchema.index({ employeeId: 1, institutionId: 1 });
StaffSchema.index({ userId: 1 });
StaffSchema.index({ fingerprintId: 1, institutionId: 1 }, { sparse: true });
StaffSchema.index({ biometricId: 1, institutionId: 1 }, { sparse: true });

import { autoGenerateIdCard } from '../utils/idCardHelper';

StaffSchema.post('save', async function (doc) {
  await autoGenerateIdCard(doc, 'staff');
});

export default mongoose.model<IStaff>('Staff', StaffSchema);
