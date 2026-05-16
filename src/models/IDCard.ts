import mongoose, { Document, Schema } from 'mongoose';

export interface IIDCard extends Document {
  ownerId: mongoose.Types.ObjectId;
  ownerType: 'student' | 'teacher' | 'staff' | 'head';
  cardNumber: string;
  cardType?: string;
  photoUrl?: string;
  qrCodeData?: string;
  barcodeData?: string;
  validityStart: Date;
  validityEnd: Date;
  status: 'active' | 'expired' | 'blocked' | 'pending-renewal';
  issuedBy: mongoose.Types.ObjectId;
  issuedAt: Date;
  downloadCount: number;
  lastDownloadedAt?: Date;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IDCardSchema: Schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  ownerType: { type: String, enum: ['student', 'teacher', 'staff', 'head'], required: true },
  cardNumber: { type: String, required: true, unique: true },
  cardType: { type: String },
  photoUrl: { type: String },
  qrCodeData: { type: String },
  barcodeData: { type: String },
  validityStart: { type: Date, required: true },
  validityEnd: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'blocked', 'pending-renewal'], default: 'active' },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  issuedAt: { type: Date, required: true },
  downloadCount: { type: Number, default: 0 },
  lastDownloadedAt: { type: Date },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
IDCardSchema.index({ ownerId: 1, ownerType: 1 });
IDCardSchema.index({ cardNumber: 1 });
IDCardSchema.index({ status: 1, validityEnd: 1 });
IDCardSchema.index({ institutionId: 1, ownerType: 1 });

export default mongoose.model<IIDCard>('IDCard', IDCardSchema);