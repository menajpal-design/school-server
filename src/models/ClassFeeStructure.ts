import mongoose, { Document, Schema } from 'mongoose';

export interface IClassFeeStructure extends Document {
  institutionId: mongoose.Types.ObjectId;
  feeType: 'monthly_tuition';
  classId: mongoose.Types.ObjectId;
  section: string;
  amount: number;
  dueDay: number;
  lateFeeAmount: number;
  effectiveFromMonth: number;
  effectiveFromYear: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClassFeeStructureSchema: Schema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  feeType: { type: String, enum: ['monthly_tuition'], default: 'monthly_tuition', index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  section: { type: String, default: 'All', trim: true },
  amount: { type: Number, required: true, min: 0 },
  dueDay: { type: Number, default: 10, min: 1, max: 31 },
  lateFeeAmount: { type: Number, default: 0, min: 0 },
  effectiveFromMonth: { type: Number, required: true, min: 1, max: 12 },
  effectiveFromYear: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

ClassFeeStructureSchema.index(
  { institutionId: 1, feeType: 1, classId: 1, section: 1, effectiveFromMonth: 1, effectiveFromYear: 1 },
  { unique: true }
);

export default mongoose.model<IClassFeeStructure>('ClassFeeStructure', ClassFeeStructureSchema);
