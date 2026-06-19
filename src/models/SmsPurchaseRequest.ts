import mongoose, { Document, Schema } from 'mongoose';

export type SmsPurchaseStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface ISmsPurchaseRequest extends Document {
  institutionId: mongoose.Types.ObjectId;
  requestedBy?: mongoose.Types.ObjectId;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  contactNumber: string;
  paymentMethod?: string;
  notes?: string;
  status: SmsPurchaseStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  paidAt?: Date;
  creditedAt?: Date;
  creditedQuantity?: number;
  createdAt: Date;
  updatedAt: Date;
}

const SmsPurchaseRequestSchema = new Schema<ISmsPurchaseRequest>({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, default: 0, min: 0 },
  contactNumber: { type: String, required: true, trim: true },
  paymentMethod: { type: String, trim: true, default: 'manual' },
  notes: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending', index: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  paidAt: { type: Date },
  creditedAt: { type: Date },
  creditedQuantity: { type: Number, default: 0 },
}, { timestamps: true });

SmsPurchaseRequestSchema.index({ institutionId: 1, createdAt: -1 });

export default mongoose.models.SmsPurchaseRequest || mongoose.model<ISmsPurchaseRequest>('SmsPurchaseRequest', SmsPurchaseRequestSchema);
