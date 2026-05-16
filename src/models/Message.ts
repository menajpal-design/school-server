import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  senderId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  subject: string;
  body: string;
  isRead: boolean;
  readAt?: Date;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema({
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
}, { timestamps: true });

MessageSchema.index({ institutionId: 1, recipientId: 1, isRead: 1 });
MessageSchema.index({ institutionId: 1, senderId: 1, createdAt: -1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
