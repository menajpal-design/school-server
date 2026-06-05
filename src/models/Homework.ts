import mongoose, { Document, Schema } from 'mongoose';

export interface IHomework extends Document {
  title: string;
  description?: string;
  subject?: string;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  dueDate: Date;
  assignedDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  institutionId: mongoose.Types.ObjectId;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HomeworkSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  subject: { type: String, trim: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', index: true },
  dueDate: { type: Date, required: true, index: true },
  assignedDate: { type: Date, default: Date.now, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  isPublished: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

HomeworkSchema.index({ institutionId: 1, classId: 1, sectionId: 1, dueDate: 1 });
HomeworkSchema.index({ institutionId: 1, subject: 1, dueDate: 1 });

export default mongoose.model<IHomework>('Homework', HomeworkSchema);
