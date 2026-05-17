import mongoose, { Document, Schema } from 'mongoose';

export interface ISyllabus extends Document {
  title: string;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  subjectId?: mongoose.Types.ObjectId;
  academicYear: string;
  term: 'full_year' | 'first_term' | 'half_yearly' | 'second_term' | 'annual' | 'custom';
  objectives?: string;
  chapters: Array<{ title: string; topics: string; weeks?: string; marks?: number }>;
  instructions?: string;
  attachmentUrl?: string;
  status: 'draft' | 'published';
  institutionId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  publishedBy?: mongoose.Types.ObjectId;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SyllabusSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  academicYear: { type: String, required: true },
  term: { type: String, enum: ['full_year', 'first_term', 'half_yearly', 'second_term', 'annual', 'custom'], default: 'full_year' },
  objectives: { type: String, trim: true },
  chapters: [{
    title: { type: String, required: true, trim: true },
    topics: { type: String, trim: true },
    weeks: { type: String, trim: true },
    marks: { type: Number, default: 0 },
  }],
  instructions: { type: String, trim: true },
  attachmentUrl: { type: String, trim: true },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  publishedAt: { type: Date },
}, { timestamps: true });

SyllabusSchema.index({ institutionId: 1, classId: 1, subjectId: 1, academicYear: 1, term: 1 });
SyllabusSchema.index({ institutionId: 1, status: 1 });

export default mongoose.model<ISyllabus>('Syllabus', SyllabusSchema);
