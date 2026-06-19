import mongoose, { Document, Schema } from 'mongoose';

export interface IAdmissionApplication extends Document {
  institutionId: mongoose.Types.ObjectId;
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  dateOfBirth?: Date;
  address: string;
  previousSchool?: string;
  previousResult?: string;
  requestedClass: string;
  status: 'pending' | 'accepted' | 'rejected';
  acceptedBy?: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  studentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdmissionApplicationSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  studentName: { type: String, required: true, trim: true },
  guardianName: { type: String, required: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  guardianEmail: { type: String, lowercase: true, trim: true },
  dateOfBirth: { type: Date },
  address: { type: String, required: true },
  previousSchool: { type: String, trim: true },
  previousResult: { type: String, trim: true },
  requestedClass: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  acceptedAt: { type: Date },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
}, { timestamps: true });

AdmissionApplicationSchema.index({ institutionId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IAdmissionApplication>('AdmissionApplication', AdmissionApplicationSchema);
