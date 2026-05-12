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
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

export default mongoose.model<IInstitution>('Institution', InstitutionSchema);
