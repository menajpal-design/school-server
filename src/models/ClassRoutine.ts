import mongoose, { Document, Schema } from 'mongoose';

export interface IClassRoutine extends Document {
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  subjectId?: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId;
  dayOfWeek: 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
  periodName: string;
  startTime: string;
  endTime: string;
  room?: string;
  note?: string;
  status: 'draft' | 'proposed' | 'approved' | 'rejected';
  proposalNote?: string;
  approvalNote?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  isActive: boolean;
  isPublic: boolean;
  institutionId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClassRoutineSchema: Schema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
  dayOfWeek: {
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    required: true,
    index: true,
  },
  periodName: { type: String, required: true, trim: true },
  startTime: { type: String, required: true, trim: true },
  endTime: { type: String, required: true, trim: true },
  room: { type: String, trim: true },
  note: { type: String, trim: true },
  status: {
    type: String,
    enum: ['draft', 'proposed', 'approved', 'rejected'],
    default: 'draft',
    index: true,
  },
  proposalNote: { type: String, trim: true },
  approvalNote: { type: String, trim: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  isActive: { type: Boolean, default: true, index: true },
  isPublic: { type: Boolean, default: false, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
});

ClassRoutineSchema.index({ institutionId: 1, classId: 1, sectionId: 1, dayOfWeek: 1, startTime: 1 });
ClassRoutineSchema.index({ institutionId: 1, status: 1, isPublic: 1, isActive: 1 });

export default mongoose.model<IClassRoutine>('ClassRoutine', ClassRoutineSchema);