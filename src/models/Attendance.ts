import mongoose, { Document, Schema } from 'mongoose';

export interface IAttendance extends Document {
  studentId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  userType: 'student' | 'teacher' | 'staff';
  classId?: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  date: Date;
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  markedBy: mongoose.Types.ObjectId;
  markedAt: Date;
  notes?: string;
  institutionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema: Schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userType: { type: String, enum: ['student', 'teacher', 'staff'], default: 'student' },
  classId: { type: Schema.Types.ObjectId, ref: 'Class' },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'leave', 'holiday'], required: true },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  markedAt: { type: Date, default: Date.now },
  notes: { type: String, trim: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true }
}, {
  timestamps: true
});

AttendanceSchema.index({ studentId: 1, date: 1 });
AttendanceSchema.index({ studentId: 1, date: 1, classId: 1, sectionId: 1 }, { unique: true });
AttendanceSchema.index({ userId: 1, userType: 1, date: 1 });
AttendanceSchema.index({ classId: 1, sectionId: 1, date: 1 });
AttendanceSchema.index({ institutionId: 1, date: 1 });

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);