// File Location: school-server/src/models/Teacher.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface ITeacher extends Document {
  userId: mongoose.Types.ObjectId;
  employeeId: string;
  designation: string;
  department: string;
  subjects: mongoose.Types.ObjectId[];
  assignedClasses: mongoose.Types.ObjectId[];
  joiningDate: Date;
  qualification: string;
  experience: number;
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

const TeacherSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  employeeId: { type: String, required: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  assignedClasses: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  joiningDate: { type: Date, required: true },
  qualification: { type: String, required: true, trim: true },
  experience: { type: Number, default: 0 },
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
TeacherSchema.index({ employeeId: 1, institutionId: 1 });
TeacherSchema.index({ userId: 1 });
TeacherSchema.index({ fingerprintId: 1, institutionId: 1 }, { sparse: true });
TeacherSchema.index({ biometricId: 1, institutionId: 1 }, { sparse: true });

import { autoGenerateIdCard } from '../utils/idCardHelper';

TeacherSchema.post('save', async function (doc) {
  await autoGenerateIdCard(doc, 'teacher');
});

export default mongoose.model<ITeacher>('Teacher', TeacherSchema);
