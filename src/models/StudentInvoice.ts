import mongoose, { Document, Schema } from 'mongoose';

export type StudentInvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'waived' | 'cancelled';

export interface IStudentInvoice extends Document {
  institutionId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  section: string;
  month: number;
  year: number;
  feeType: 'monthly_tuition';
  invoiceNo: string;
  items: Array<{ name: string; amount: number; discount: number; lateFee: number }>;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: StudentInvoiceStatus;
  dueDate?: Date;
  generatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentInvoiceSchema: Schema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  section: { type: String, default: 'All', trim: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  feeType: { type: String, enum: ['monthly_tuition'], default: 'monthly_tuition', index: true },
  invoiceNo: { type: String, required: true, unique: true },
  items: [{
    name: { type: String, trim: true },
    amount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    lateFee: { type: Number, default: 0 },
  }],
  totalAmount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  dueAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['unpaid', 'partial', 'paid', 'overdue', 'waived', 'cancelled'], default: 'unpaid', index: true },
  dueDate: { type: Date },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

StudentInvoiceSchema.index(
  { institutionId: 1, studentId: 1, classId: 1, month: 1, year: 1, feeType: 1 },
  { unique: true }
);

export default mongoose.model<IStudentInvoice>('StudentInvoice', StudentInvoiceSchema);
