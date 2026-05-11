import mongoose, { Document, Schema } from 'mongoose';

export interface IExam extends Document {
  name: string;
  type: 'term' | 'half-yearly' | 'annual' | 'midterm' | 'final' | 'quiz' | 'assignment' | 'project';
  subjectId?: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  date?: Date;
  duration?: number; // in minutes
  totalMarks?: number;
  passingMarks?: number;
  subjectMarks: {
    subjectId: mongoose.Types.ObjectId;
    date: Date;
    duration: number;
    totalMarks: number;
    passingMarks: number;
  }[];
  approvalRequired: boolean;
  status: 'draft' | 'scheduled' | 'approved' | 'published' | 'completed';
  syllabus?: string;
  instructions?: string;
  isPublished: boolean;
  createdBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['term', 'half-yearly', 'annual', 'midterm', 'final', 'quiz', 'assignment', 'project'], required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  date: { type: Date },
  duration: { type: Number },
  totalMarks: { type: Number },
  passingMarks: { type: Number },
  subjectMarks: [{
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true, default: 120 },
    totalMarks: { type: Number, required: true, default: 100 },
    passingMarks: { type: Number, required: true, default: 33 },
  }],
  approvalRequired: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'scheduled', 'approved', 'published', 'completed'], default: 'scheduled' },
  syllabus: { type: String, trim: true },
  instructions: { type: String, trim: true },
  isPublished: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
ExamSchema.index({ subjectId: 1, date: 1 });
ExamSchema.index({ classId: 1, type: 1 });
ExamSchema.index({ institutionId: 1, date: 1 });

export default mongoose.model<IExam>('Exam', ExamSchema);
