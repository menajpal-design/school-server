import mongoose, { Document, Schema } from 'mongoose';

export interface IParent extends Document {
  userId: mongoose.Types.ObjectId;
  children: mongoose.Types.ObjectId[];
  occupation?: string;
  income?: number;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  isActive: boolean;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ParentSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  children: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  occupation: { type: String, trim: true },
  income: { type: Number },
  address: { type: String, required: true },
  emergencyContact: { type: String, required: true, trim: true },
  emergencyPhone: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
ParentSchema.index({ userId: 1 });
ParentSchema.index({ institutionId: 1 });

export default mongoose.model<IParent>('Parent', ParentSchema);