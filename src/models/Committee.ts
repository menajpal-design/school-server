import mongoose, { Document, Schema } from 'mongoose';

export interface ICommittee extends Document {
  name: string;
  type: 'academic' | 'finance' | 'discipline' | 'sports' | 'cultural' | 'other';
  description?: string;
  chairmanId: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  formationDate: Date;
  termEndDate?: Date;
  isActive: boolean;
  responsibilities?: string[];
  meetingSchedule?: string;
  agenda?: string;
  minutes?: string;
  meetingAttendance?: {
    meetingDate: Date;
    attendeeId: mongoose.Types.ObjectId;
    status: 'present' | 'absent' | 'late';
  }[];
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommitteeSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['academic', 'finance', 'discipline', 'sports', 'cultural', 'other'], required: true },
  description: { type: String, trim: true },
  chairmanId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  formationDate: { type: Date, required: true },
  termEndDate: { type: Date },
  isActive: { type: Boolean, default: true },
  responsibilities: [{ type: String, trim: true }],
  meetingSchedule: { type: String, trim: true },
  agenda: { type: String, trim: true },
  minutes: { type: String, trim: true },
  meetingAttendance: [{
    meetingDate: { type: Date, required: true },
    attendeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' }
  }],
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

// Indexes
CommitteeSchema.index({ type: 1, isActive: 1 });
CommitteeSchema.index({ chairmanId: 1 });
CommitteeSchema.index({ institutionId: 1, isActive: 1 });

export default mongoose.model<ICommittee>('Committee', CommitteeSchema);
