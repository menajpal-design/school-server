import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  title: string;
  body?: string;
  link?: string;
  type?: string;
  isRead: boolean;
  recipientId?: mongoose.Types.ObjectId; // optional: null means broadcast
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, trim: true },
  link: { type: String, trim: true },
  type: { type: String, trim: true },
  isRead: { type: Boolean, default: false },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

NotificationSchema.index({ institutionId: 1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
