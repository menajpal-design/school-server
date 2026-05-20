import mongoose, { Document, Schema } from 'mongoose';

export interface IInstitution extends Document {
  name: string;
  type: 'school' | 'madrasah';
  eiin?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  domains?: string[];
  logo?: string;
  seal?: string;
  headSignature?: string;
  headId: mongoose.Types.ObjectId;
  billing?: {
    planCode?: string;
    planName?: string;
    studentLimit?: number;
    monthlyPrice?: number;
    yearlyPrice?: number;
    monthlySmsLimit?: number;
    yearlyDiscountPercent?: number;
    billingCycle?: 'monthly' | 'yearly';
    useEasySchoolStorage?: boolean;
    storageMonthlyPrice?: number;
    storageAmount?: number;
    dueAmount?: number;
    billingStatus?: 'pending' | 'active' | 'expired' | 'cancelled';
    isPaymentReceived?: boolean;
    receivedAmount?: number;
    receivedAt?: Date;
    receivedBy?: mongoose.Types.ObjectId;
    paymentGateway?: string;
    paymentTrxId?: string;
    paymentSenderNumber?: string;
    paymentOrderId?: string;
    paymentTime?: string;
    paymentVerificationRequestId?: string;
    paymentVerificationRedirectUrl?: string;
    paymentVerificationResponse?: Record<string, any>;
    activatedAt?: Date;
    subscriptionStartedAt?: Date;
    subscriptionExpiresAt?: Date;
    paymentVerifyStatus?: 'pending' | 'verified' | 'failed';
    paymentVerifiedAt?: Date;
    smsUsed?: number;
    smsPeriodStart?: Date;
    smsPeriodEnd?: Date;
  };
  settings: {
    mongodbUri?: string;
    imgbbApiKey?: string;
    smsEnabled?: boolean;
    smsProvider?: string;
    smsApiUrl?: string;
    smsApiKey?: string;
    activeAcademicYear?: string;
    academicYears?: {
      year: string;
      mongodbUri?: string;
      imgbbApiKey?: string;
      isActive?: boolean;
    }[];
    backupSettings: {
      frequency: 'daily' | 'weekly' | 'monthly';
      location: string;
      collections: string[];
    };
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InstitutionSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['school', 'madrasah'], required: true },
  eiin: { type: String, trim: true },
  address: { type: String, required: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  website: { type: String, trim: true },
  domains: [{ type: String, lowercase: true, trim: true }],
  logo: { type: String },
  seal: { type: String },
  headSignature: { type: String },
  headId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  billing: {
    planCode: { type: String, default: 'students_100' },
    planName: { type: String, default: '100 Students' },
    studentLimit: { type: Number, default: 100 },
    monthlyPrice: { type: Number, default: 300 },
    yearlyPrice: { type: Number, default: 3000 },
    monthlySmsLimit: { type: Number, default: 100 },
    yearlyDiscountPercent: { type: Number, default: 17 },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    useEasySchoolStorage: { type: Boolean, default: true },
    storageMonthlyPrice: { type: Number, default: 100 },
    storageAmount: { type: Number, default: 100 },
    dueAmount: { type: Number, default: 400 },
    billingStatus: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], default: 'pending' },
    isPaymentReceived: { type: Boolean, default: false },
    receivedAmount: { type: Number, default: 0 },
    receivedAt: { type: Date },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paymentGateway: { type: String },
    paymentTrxId: { type: String },
    paymentSenderNumber: { type: String },
    paymentOrderId: { type: String },
    paymentTime: { type: Date },
    paymentVerificationRequestId: { type: String },
    paymentVerificationRedirectUrl: { type: String },
    paymentVerificationResponse: { type: Schema.Types.Mixed },
    activatedAt: { type: Date },
    subscriptionStartedAt: { type: Date },
    subscriptionExpiresAt: { type: Date },
    paymentVerifyStatus: { type: String, enum: ['pending', 'verified', 'failed'], default: 'pending' },
    paymentVerifiedAt: { type: Date },
    smsUsed: { type: Number, default: 0 },
    smsPeriodStart: { type: Date },
    smsPeriodEnd: { type: Date },
  },
  settings: {
    mongodbUri: { type: String },
    imgbbApiKey: { type: String },
    smsEnabled: { type: Boolean, default: true },
    smsProvider: { type: String, default: 'anoncify' },
    smsApiUrl: { type: String },
    smsApiKey: { type: String },
    activeAcademicYear: { type: String },
    academicYears: [{
      year: { type: String, trim: true },
      mongodbUri: { type: String },
      imgbbApiKey: { type: String },
      isActive: { type: Boolean, default: false },
    }],
    backupSettings: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
      location: { type: String, default: 'local' },
      collections: [{ type: String }]
    }
  },
  isActive: { type: Boolean, default: false }
}, {
  timestamps: true
});

export default mongoose.model<IInstitution>('Institution', InstitutionSchema);
