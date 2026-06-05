import mongoose, { Document, Schema } from 'mongoose';

export interface ILoan extends Document {
  book: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  studentId?: mongoose.Types.ObjectId;
  issuedBy?: mongoose.Types.ObjectId;
  institutionId?: mongoose.Types.ObjectId;
  issuedAt: Date;
  dueDate: Date;
  returnedAt?: Date;
  fine: number;
  status: 'issued' | 'returned' | 'overdue' | 'requested';
  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema: Schema = new Schema(
  {
    book: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', index: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', index: true },
    issuedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnedAt: { type: Date },
    fine: { type: Number, default: 0 },
    status: { type: String, enum: ['issued', 'returned', 'overdue', 'requested'], default: 'issued', index: true },
  },
  { timestamps: true }
);

LoanSchema.index({ institutionId: 1, user: 1, status: 1 });
LoanSchema.index({ institutionId: 1, studentId: 1, status: 1 });

export default mongoose.model<ILoan>('Loan', LoanSchema);
