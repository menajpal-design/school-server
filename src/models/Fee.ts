import mongoose, { Document, Schema } from 'mongoose';

export interface IFee extends Document {
  studentId: mongoose.Types.ObjectId;
  classId?: mongoose.Types.ObjectId;
  amount: number;
  type: 'monthly' | 'annual' | 'exam' | 'tuition' | 'transport' | 'other';
  scholarship?: number;
  discount?: number;
  month: string;
  year: number;
  dueDate: Date;
  paidDate?: Date;
  status: 'pending' | 'paid' | 'overdue';
  paymentMethod?: 'cash' | 'bkash' | 'nagad' | 'rocket' | 'card';
  transactionId?: string;
  collectedBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeSchema: Schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
  classId: { type: Schema.Types.ObjectId, ref: 'Class' },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['monthly', 'annual', 'exam', 'tuition', 'transport', 'other'], required: true },
  scholarship: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  month: { type: String, required: true },
  year: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  paidDate: { type: Date },
  status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
  paymentMethod: { type: String, enum: ['cash', 'bkash', 'nagad', 'rocket', 'card'] },
  transactionId: { type: String, trim: true },
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
FeeSchema.index({ studentId: 1, month: 1, year: 1 });
FeeSchema.index({ status: 1, dueDate: 1 });
FeeSchema.index({ institutionId: 1, status: 1 });

export default mongoose.model<IFee>('Fee', FeeSchema);
