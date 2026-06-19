import mongoose, { Document, Schema } from 'mongoose';

export interface IResult extends Document {
  studentId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  year?: number;
  marksObtained?: number;
  grade?: string;
  remarks?: string;
  isPassed?: boolean;
  workflowStatus: 'draft' | 'review' | 'approved' | 'published';
  assistantHeadApprovedBy?: mongoose.Types.ObjectId;
  assistantHeadApprovedAt?: Date;
  headApprovedBy?: mongoose.Types.ObjectId;
  headApprovedAt?: Date;
  publishedBy?: mongoose.Types.ObjectId;
  publishedAt?: Date;
  markedBy: mongoose.Types.ObjectId;
  markedAt: Date;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ResultSchema: Schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  year: { type: Number, index: true },
  marksObtained: { type: Number },
  grade: { type: String, trim: true },
  remarks: { type: String, trim: true },
  isPassed: { type: Boolean },
  workflowStatus: { type: String, enum: ['draft', 'review', 'approved', 'published'], default: 'draft' },
  assistantHeadApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  assistantHeadApprovedAt: { type: Date },
  headApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  headApprovedAt: { type: Date },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  publishedAt: { type: Date },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  markedAt: { type: Date, default: Date.now },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

ResultSchema.index({ studentId: 1, examId: 1, subjectId: 1 }, { unique: true });
ResultSchema.index({ examId: 1 });
ResultSchema.index({ subjectId: 1 });
ResultSchema.index({ workflowStatus: 1 });
ResultSchema.index({ institutionId: 1 });
ResultSchema.index({ institutionId: 1, year: 1, workflowStatus: 1 });

export default mongoose.model<IResult>('Result', ResultSchema);
