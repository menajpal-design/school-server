import mongoose, { Document, Schema } from 'mongoose';

export interface ISalary extends Document {
  employeeId: mongoose.Types.ObjectId; // Can be Teacher or Staff
  employeeType: 'teacher' | 'staff';
  basicSalary: number;
  allowances: {
    houseRent?: number;
    medical?: number;
    transport?: number;
    other?: number;
  };
  deductions: {
    tax?: number;
    providentFund?: number;
    loan?: number;
    attendance?: number;
    other?: number;
  };
  attendanceSummary?: {
    workingDays?: number;
    presentDays?: number;
    absentDays?: number;
    lateDays?: number;
    leaveDays?: number;
    unpaidAbsentDays?: number;
    perDaySalary?: number;
    attendanceDeduction?: number;
  };
  grossSalary: number;
  netSalary: number;
  month: string;
  year: number;
  paymentDate?: Date;
  status: 'pending' | 'paid' | 'overdue';
  paymentMethod?: 'cash' | 'bank_transfer' | 'cheque';
  transactionId?: string;
  processedBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SalarySchema: Schema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, required: true }, // Dynamic ref based on employeeType
  employeeType: { type: String, enum: ['teacher', 'staff'], required: true },
  basicSalary: { type: Number, required: true },
  allowances: {
    houseRent: { type: Number, default: 0 },
    medical: { type: Number, default: 0 },
    transport: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  deductions: {
    tax: { type: Number, default: 0 },
    providentFund: { type: Number, default: 0 },
    loan: { type: Number, default: 0 },
    attendance: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  attendanceSummary: {
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    unpaidAbsentDays: { type: Number, default: 0 },
    perDaySalary: { type: Number, default: 0 },
    attendanceDeduction: { type: Number, default: 0 }
  },
  grossSalary: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  month: { type: String, required: true },
  year: { type: Number, required: true },
  paymentDate: { type: Date },
  status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'cheque'] },
  transactionId: { type: String, trim: true },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
SalarySchema.index({ employeeId: 1, month: 1, year: 1 });
SalarySchema.index({ employeeType: 1, status: 1 });
SalarySchema.index({ institutionId: 1, month: 1, year: 1 });

export default mongoose.model<ISalary>('Salary', SalarySchema);