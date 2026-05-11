import mongoose, { Document, Schema } from 'mongoose';

export interface ISection extends Document {
  name: string;
  classId: mongoose.Types.ObjectId;
  sectionTeacherId?: mongoose.Types.ObjectId;
  capacity: number;
  currentStudents: number;
  isActive: boolean;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SectionSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionTeacherId: { type: Schema.Types.ObjectId, ref: 'User' },
  capacity: { type: Number, required: true, default: 30 },
  currentStudents: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
SectionSchema.index({ name: 1, classId: 1, institutionId: 1 });
SectionSchema.index({ classId: 1 });

export default mongoose.model<ISection>('Section', SectionSchema);