import mongoose, { Document, Schema } from 'mongoose';

export interface IStudentFeePayment extends Document {
  institutionId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  collectedBy?: mongoose.Types.ObjectId;
  collectedByRole?: string;
  amount: number;
  paymentMethod: string;
  status: string;
  receiptNo: string;
  note?: string;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentFeePaymentSchema: Schema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'StudentInvoice', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  collectedByRole: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, default: 'cash' },
  status: { type: String, default: 'verified', index: true },
  receiptNo: { type: String, required: true, unique: true },
  note: { type: String, trim: true },
  paidAt: { type: Date, default: Date.now },
}, { timestamps: true });

StudentFeePaymentSchema.index({ institutionId: 1, paidAt: -1 });
StudentFeePaymentSchema.index({ institutionId: 1, studentId: 1, paidAt: -1 });

export default mongoose.model<IStudentFeePayment>('StudentFeePayment', StudentFeePaymentSchema);
