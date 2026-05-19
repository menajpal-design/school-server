import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  _id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserEmail: string;
  toUserId: string;
  toUserName: string;
  toUserEmail: string;
  subject: string;
  body: string;
  messageType: 'email' | 'internal' | 'notification'; // email sent via SMTP, internal is in-app, notification is alert
  isRead: boolean;
  readAt?: Date;
  sentAt: Date;
  attachments?: string[]; // file URLs or paths
  folder: 'inbox' | 'sent' | 'trash'; // for in-app messaging
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    fromUserId: { type: String, required: true },
    fromUserName: { type: String, required: true },
    fromUserEmail: { type: String, required: true },
    toUserId: { type: String, required: true },
    toUserName: { type: String, required: true },
    toUserEmail: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    messageType: { type: String, enum: ['email', 'internal', 'notification'], default: 'internal' },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    sentAt: { type: Date, default: () => new Date() },
    attachments: [{ type: String }],
    folder: { type: String, enum: ['inbox', 'sent', 'trash'], default: 'inbox' },
  },
  { timestamps: true }
);

// Index for faster queries
MessageSchema.index({ toUserId: 1, createdAt: -1 });
MessageSchema.index({ fromUserId: 1, createdAt: -1 });
MessageSchema.index({ toUserId: 1, isRead: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
