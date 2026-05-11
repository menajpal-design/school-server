import mongoose, { Document, Schema } from 'mongoose';

export interface IClass extends Document {
  name: string;
  grade: string;
  sections: mongoose.Types.ObjectId[];
  shift: 'morning' | 'day' | 'evening';
  classTeacherId?: mongoose.Types.ObjectId;
  subjects: mongoose.Types.ObjectId[];
  academicYear: string;
  isActive: boolean;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClassSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  grade: { type: String, required: true, trim: true },
  sections: [{ type: Schema.Types.ObjectId, ref: 'Section' }],
  shift: { type: String, enum: ['morning', 'day', 'evening'], default: 'day' },
  classTeacherId: { type: Schema.Types.ObjectId, ref: 'User' },
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  academicYear: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
ClassSchema.index({ name: 1, institutionId: 1 });
ClassSchema.index({ grade: 1, institutionId: 1 });
ClassSchema.index({ academicYear: 1, institutionId: 1 });

export default mongoose.model<IClass>('Class', ClassSchema);
