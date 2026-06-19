import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
  feeId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  amount: number;
  paymentMethod: 'cash' | 'bkash' | 'nagad' | 'rocket' | 'card' | 'bank_transfer';
  transactionId?: string;
  paymentDate: Date;
  collectedBy: mongoose.Types.ObjectId;
  notes?: string;
  receiptNumber: string;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
  feeId: { type: Schema.Types.ObjectId, ref: 'Fee', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank_transfer'], required: true },
  transactionId: { type: String, trim: true },
  paymentDate: { type: Date, required: true },
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String, trim: true },
  receiptNumber: { type: String, required: true, unique: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
PaymentSchema.index({ feeId: 1 });
PaymentSchema.index({ studentId: 1, paymentDate: 1 });
PaymentSchema.index({ receiptNumber: 1 });
PaymentSchema.index({ institutionId: 1, paymentDate: 1 });

export default mongoose.model<IPayment>('Payment', PaymentSchema);