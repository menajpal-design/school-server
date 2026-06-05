import mongoose, { Document, Schema } from 'mongoose';

export interface ILeaveApplication extends Document {
  studentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  applicantType: 'student' | 'parent';
  classId?: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  attachmentUrl?: string;
  guardianNote?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedReason?: string;
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
  applicantType: { type: String, enum: ['student', 'parent'], default: 'student', index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', index: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  totalDays: { type: Number, default: 1 },
  reason: { type: String, required: true, trim: true },
  attachmentUrl: { type: String, trim: true },
  guardianNote: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedReason: { type: String, trim: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  reviewNote: { type: String, trim: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
}, { timestamps: true });

LeaveApplicationSchema.index({ institutionId: 1, status: 1, startDate: 1, endDate: 1 });
LeaveApplicationSchema.index({ studentId: 1, startDate: 1, endDate: 1 });
LeaveApplicationSchema.index({ applicantType: 1, institutionId: 1 });

export default mongoose.model<ILeaveApplication>('LeaveApplication', LeaveApplicationSchema);
