import mongoose, { Document, Schema } from 'mongoose';

export type PromotionDecision = 'promoted' | 'failed' | 'manual_promoted';

export interface IPromotionRecord extends Document {
  studentId: mongoose.Types.ObjectId;
  fromClassId: mongoose.Types.ObjectId;
  fromSectionId?: mongoose.Types.ObjectId;
  toClassId?: mongoose.Types.ObjectId;
  toSectionId?: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  failedSubjects: number;
  decision: PromotionDecision;
  reason?: string;
  promotedBy: mongoose.Types.ObjectId;
  promotedAt: Date;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PromotionRecordSchema: Schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  fromClassId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  fromSectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  toClassId: { type: Schema.Types.ObjectId, ref: 'Class' },
  toSectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
  failedSubjects: { type: Number, default: 0 },
  decision: { type: String, enum: ['promoted', 'failed', 'manual_promoted'], required: true },
  reason: { type: String, trim: true },
  promotedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  promotedAt: { type: Date, default: Date.now },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
}, {
  timestamps: true,
});

PromotionRecordSchema.index({ institutionId: 1, examId: 1, studentId: 1 }, { unique: true });
PromotionRecordSchema.index({ institutionId: 1, fromClassId: 1, toClassId: 1 });

export default mongoose.model<IPromotionRecord>('PromotionRecord', PromotionRecordSchema);
