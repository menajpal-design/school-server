import mongoose, { Document, Schema } from 'mongoose';

export interface IHoliday extends Document {
  title: string;
  titleBn?: string;
  type: 'government' | 'religious' | 'school' | 'weekend' | 'custom';
  startDate: Date;
  endDate: Date;
  description?: string;
  isSchoolClosed: boolean;
  isEnabled: boolean;
  source?: 'bangladesh_default' | 'institution_custom' | 'manual';
  color?: string;
  academicYear?: string;
  institutionId: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema: Schema = new Schema({
  title: { type: String, required: true, trim: true },
  titleBn: { type: String, trim: true },
  type: { type: String, enum: ['government', 'religious', 'school', 'weekend', 'custom'], default: 'government' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  description: { type: String, trim: true },
  isSchoolClosed: { type: Boolean, default: true },
  isEnabled: { type: Boolean, default: true },
  source: { type: String, enum: ['bangladesh_default', 'institution_custom', 'manual'], default: 'manual' },
  color: { type: String, default: '#ef4444' },
  academicYear: { type: String },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

HolidaySchema.index({ institutionId: 1, startDate: 1, endDate: 1 });
HolidaySchema.index({ institutionId: 1, academicYear: 1, source: 1 });
HolidaySchema.index({ institutionId: 1, title: 1, startDate: 1 }, { unique: true });

export default mongoose.model<IHoliday>('Holiday', HolidaySchema);