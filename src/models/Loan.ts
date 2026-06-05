import mongoose, { Document, Schema } from 'mongoose';

export interface ILoan extends Document {
  book: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  issuedBy?: mongoose.Types.ObjectId;
  issuedAt: Date;
  dueDate: Date;
  returnedAt?: Date;
  fine: number;
  status: 'issued' | 'returned' | 'overdue' | 'requested';
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema: Schema = new Schema(
  {
    book: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, required: true, index: true },
    returnedAt: { type: Date },
    fine: { type: Number, default: 0 },
    status: { type: String, enum: ['issued', 'returned', 'overdue', 'requested'], default: 'issued', index: true },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  },
  { timestamps: true }
);

LoanSchema.index({ institutionId: 1, user: 1, status: 1 });
LoanSchema.index({ institutionId: 1, book: 1, status: 1 });

export default mongoose.model<ILoan>('Loan', LoanSchema);
