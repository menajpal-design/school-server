import mongoose, { Document, Schema } from 'mongoose';

export interface ISubject extends Document {
  name: string;
  code: string;
  type: 'core' | 'elective' | 'optional';
  classId: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId;
  description?: string;
  creditHours: number;
  isActive: boolean;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  type: { type: String, enum: ['core', 'elective', 'optional'], required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
  description: { type: String, trim: true },
  creditHours: { type: Number, required: true, default: 1 },
  isActive: { type: Boolean, default: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
SubjectSchema.index({ code: 1, institutionId: 1 });
SubjectSchema.index({ name: 1, classId: 1, institutionId: 1 });
SubjectSchema.index({ teacherId: 1 });

export default mongoose.model<ISubject>('Subject', SubjectSchema);