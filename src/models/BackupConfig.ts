import mongoose, { Document, Schema } from 'mongoose';

export interface IBackupConfig extends Document {
  institutionId: mongoose.Types.ObjectId;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  location: 'local' | 'google_drive' | 'dropbox' | 'ftp' | 'cloud' | 'both';
  cloudProvider?: 'google_drive' | 'dropbox' | 'aws_s3' | 'azure' | 'ftp';
  cloudCredentials?: any; // Encrypted credentials
  collections: string[];
  retentionDays: number;
  lastBackup?: Date;
  nextBackup?: Date;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BackupConfigSchema: Schema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  time: { type: String, required: true, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ },
  location: { type: String, enum: ['local', 'google_drive', 'dropbox', 'ftp', 'cloud', 'both'], required: true },
  cloudProvider: { type: String, enum: ['google_drive', 'dropbox', 'aws_s3', 'azure', 'ftp'] },
  cloudCredentials: { type: Schema.Types.Mixed },
  collections: [{ type: String, required: true }],
  retentionDays: { type: Number, required: true, default: 30 },
  lastBackup: { type: Date },
  nextBackup: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

// Indexes
BackupConfigSchema.index({ institutionId: 1 });
BackupConfigSchema.index({ nextBackup: 1, isActive: 1 });

export default mongoose.model<IBackupConfig>('BackupConfig', BackupConfigSchema);
