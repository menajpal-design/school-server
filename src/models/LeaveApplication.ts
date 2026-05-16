import mongoose, { Document, Schema } from 'mongoose';

export interface ILeaveApplication extends Document {
  studentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  classId?: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  guardianNote?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveApplicationSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', index: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  totalDays: { type: Number, default: 1 },
  reason: { type: String, required: true, trim: true },
  guardianNote: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  reviewNote: { type: String, trim: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
}, { timestamps: true });

LeaveApplicationSchema.index({ institutionId: 1, status: 1, startDate: 1, endDate: 1 });
LeaveApplicationSchema.index({ studentId: 1, startDate: 1, endDate: 1 });

export default mongoose.model<ILeaveApplication>('LeaveApplication', LeaveApplicationSchema);
