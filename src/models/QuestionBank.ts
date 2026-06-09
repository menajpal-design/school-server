import mongoose, { Document, Schema } from 'mongoose';

export interface IQuestionBank extends Document {
  title: string;
  mode: 'question' | 'mcq';
  classId?: mongoose.Types.ObjectId;
  subjectId?: mongoose.Types.ObjectId;
  className?: string;
  subjectName?: string;
  syllabus?: string;
  duration?: string;
  totalMarks: number;
  rollRequired: boolean;
  isPublished: boolean;
  questions: Array<{ type: string; question: string; options?: string[]; answer?: string; marks?: number }>;
  createdBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema({
  type: { type: String, default: 'mcq' },
  question: { type: String, required: true, trim: true },
  options: [{ type: String, trim: true }],
  answer: { type: String, trim: true },
  marks: { type: Number, default: 1 },
}, { _id: false });

const QuestionBankSchema = new Schema({
  title: { type: String, required: true, trim: true },
  mode: { type: String, enum: ['question', 'mcq'], default: 'mcq' },
  classId: { type: Schema.Types.ObjectId, ref: 'Class' },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  className: { type: String, trim: true },
  subjectName: { type: String, trim: true },
  syllabus: { type: String, trim: true },
  duration: { type: String, trim: true, default: '30 minutes' },
  totalMarks: { type: Number, default: 0 },
  rollRequired: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: false },
  questions: [ItemSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
}, { timestamps: true });

QuestionBankSchema.index({ institutionId: 1, mode: 1, classId: 1, subjectId: 1 });
QuestionBankSchema.index({ institutionId: 1, isPublished: 1 });

export default mongoose.model<IQuestionBank>('QuestionBank', QuestionBankSchema);
