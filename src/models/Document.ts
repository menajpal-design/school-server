import mongoose, { Document, Schema } from 'mongoose';

export interface IDocument extends Document {
  title: string;
  type: 'id_card_photo' | 'signature' | 'certificate' | 'result' | 'notice' | 'other';
  ownerType?: 'student' | 'teacher' | 'staff' | 'institution' | 'notice';
  ownerId?: mongoose.Types.ObjectId;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId; // For user-specific documents
  isPublic: boolean;
  tags?: string[];
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ['id_card_photo', 'signature', 'certificate', 'result', 'notice', 'other'], required: true },
  ownerType: { type: String, enum: ['student', 'teacher', 'staff', 'institution', 'notice'] },
  ownerId: { type: Schema.Types.ObjectId },
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true, trim: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  isPublic: { type: Boolean, default: false },
  tags: [{ type: String, trim: true }],
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
DocumentSchema.index({ userId: 1, type: 1 });
DocumentSchema.index({ uploadedBy: 1 });
DocumentSchema.index({ institutionId: 1, type: 1 });
DocumentSchema.index({ ownerType: 1, ownerId: 1 });

export default mongoose.model<IDocument>('Document', DocumentSchema);
