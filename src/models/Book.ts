import mongoose, { Document, Schema } from 'mongoose';

export interface IBook extends Document {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  category?: string;
  location?: string;
  copiesTotal: number;
  copiesAvailable: number;
  tags?: string[];
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    isbn: { type: String },
    publisher: { type: String },
    category: { type: String },
    location: { type: String },
    copiesTotal: { type: Number, default: 1 },
    copiesAvailable: { type: Number, default: 1 },
    tags: [{ type: String }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model<IBook>('Book', BookSchema);
