import mongoose, { Document, Schema } from 'mongoose';

export interface IStudent extends Document {
  userId: mongoose.Types.ObjectId;
  rollNumber: string;
  classId: mongoose.Types.ObjectId;
  sectionId: mongoose.Types.ObjectId;
  admissionDate: Date;
  dateOfBirth: Date;
  bloodGroup?: string;
  address: string;
  parentId?: mongoose.Types.ObjectId;
  fatherName?: string;
  motherName?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  subjects: mongoose.Types.ObjectId[];
  isActive: boolean;
  idCardNumber?: string;
  idCardExpiry?: Date;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rollNumber: { type: String, required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  admissionDate: { type: Date, required: true },
  dateOfBirth: { type: Date, required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  address: { type: String, required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'User' },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  guardianName: { type: String, required: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  guardianEmail: { type: String, lowercase: true, trim: true },
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  isActive: { type: Boolean, default: true },
  idCardNumber: { type: String },
  idCardExpiry: { type: Date },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

StudentSchema.index({ rollNumber: 1, institutionId: 1 });
StudentSchema.index({ classId: 1, sectionId: 1 });
StudentSchema.index({ userId: 1 });

export default mongoose.model<IStudent>('Student', StudentSchema);