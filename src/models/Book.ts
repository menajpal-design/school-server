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
  status?: 'active' | 'archived';
  tags?: string[];
  createdBy?: mongoose.Types.ObjectId;
  institutionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    isbn: { type: String, trim: true },
    publisher: { type: String, trim: true },
    category: { type: String, trim: true },
    location: { type: String, trim: true },
    qrCodeValue: { type: String, unique: true, sparse: true },
    copiesTotal: { type: Number, default: 1 },
    copiesAvailable: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    tags: [{ type: String }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', index: true },
  },
  { timestamps: true }
);

BookSchema.index({ institutionId: 1, title: 1 });
BookSchema.index({ institutionId: 1, category: 1 });

export default mongoose.model<IBook>('Book', BookSchema);
