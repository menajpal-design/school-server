import mongoose, { Document, Schema } from 'mongoose';

export interface ILoan extends Document {
  book: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  issuedBy?: mongoose.Types.ObjectId;
  issuedAt: Date;
  dueDate: Date;
  returnedAt?: Date;
  fine: number;
  status: 'issued' | 'returned' | 'overdue';
  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema: Schema = new Schema(
  {
    book: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnedAt: { type: Date },
    fine: { type: Number, default: 0 },
    status: { type: String, enum: ['issued', 'returned', 'overdue'], default: 'issued' },
  },
  { timestamps: true }
);

export default mongoose.model<ILoan>('Loan', LoanSchema);
