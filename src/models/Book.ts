import mongoose, { Document, Schema } from 'mongoose';

export interface IBook extends Document {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  category?: string;
  location?: string;
  qrCodeValue?: string;
  copiesTotal: number;
  copiesAvailable: number;
  tags?: string[];
  status: 'available' | 'unavailable' | 'archived';
  institutionId: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    author: { type: String, required: true, trim: true },
    isbn: { type: String, trim: true },
    publisher: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    location: { type: String, trim: true },
    qrCodeValue: { type: String, unique: true, sparse: true },
    copiesTotal: { type: Number, default: 1, min: 0 },
    copiesAvailable: { type: Number, default: 1, min: 0, index: true },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['available', 'unavailable', 'archived'], default: 'available', index: true },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

BookSchema.index({ institutionId: 1, title: 1 });
BookSchema.index({ institutionId: 1, category: 1 });
BookSchema.index({ institutionId: 1, status: 1, copiesAvailable: 1 });

export default mongoose.model<IBook>('Book', BookSchema);
