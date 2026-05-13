/**
 * Application Configuration
 * Centralized configuration management with validation
 */

export interface Config {
  // Server
  port: number;
  nodeEnv: 'development' | 'production' | 'test';

  // JWT
  jwtSecret: string;
  jwtExpire: string;

  // MongoDB
  mongoUri: string;
  mongoDbName: string;
  mongoReplicaSet: string;
  mongoSSL: boolean;
  mongoPoolSize: number;
  mongoPersistenceEnabled: boolean;

  // Snapshots
  mongoSnapshotCollection: string;
  mongoSnapshotId: string;

  // Uploads
  imgbbApiKey: string;
  uploadMaxSizeMB: number;
  uploadAllowedTypes: string[];
  uploadPath: string;

  // Email
  emailEnabled: boolean;
  emailUser: string;
  emailPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;

  // SMS
  smsEnabled: boolean;
  smsProvider: string;
  smsTwilioAccountSID: string;
  smsTwilioAuthToken: string;
  smsTwilioPhoneNumber: string;

  // URLs
  frontendUrl: string;
  mobileUrl: string;
}

/**
 * Get and validate configuration
 */
export const getConfig = (): Config => {
  const config: Config = {
    // Server
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'your_super_secret_key_with_at_least_32_characters_1234567890',
    jwtExpire: process.env.JWT_EXPIRE || '7d',

    // MongoDB
      mongoUri: 'mongodb+srv://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0',
    mongoDbName: process.env.MONGO_DB_NAME || 'drms',
    mongoReplicaSet: process.env.MONGO_REPLICA_SET || '',
    mongoSSL: process.env.MONGO_SSL === 'true',
    mongoPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10', 10),
    mongoPersistenceEnabled: process.env.MONGO_PERSISTENCE_ENABLED === 'true',

    // Snapshots
    mongoSnapshotCollection: process.env.MONGO_SNAPSHOT_COLLECTION || 'app_snapshots',
    mongoSnapshotId: process.env.MONGO_SNAPSHOT_ID || 'app-main',

    // Uploads
    imgbbApiKey: process.env.IMGBB_API_KEY || '',
    uploadMaxSizeMB: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5', 10),
    uploadAllowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'image/jpeg,image/png,application/pdf').split(','),
    uploadPath: process.env.UPLOAD_PATH || './uploads',

    // Email
    emailEnabled: process.env.EMAIL_ENABLED === 'true',
    emailUser: process.env.EMAIL_USER || '',
    emailPass: process.env.EMAIL_PASS || '',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',

    // SMS
    smsEnabled: process.env.SMS_ENABLED === 'true',
    smsProvider: process.env.SMS_PROVIDER || 'twilio',
    smsTwilioAccountSID: process.env.SMS_ACCOUNT_SID || '',
    smsTwilioAuthToken: process.env.SMS_AUTH_TOKEN || '',
    smsTwilioPhoneNumber: process.env.SMS_PHONE_NUMBER || '',

    // URLs
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    mobileUrl: process.env.MOBILE_URL || 'http://localhost:8081',
  };

  // Validate critical configuration
  validateConfig(config);

  return config;
};

/**
 * Validate configuration
 */
export const validateConfig = (config: Config): void => {
  const errors: string[] = [];

  // JWT Secret validation
  if (config.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  // MongoDB URI validation
  if (!config.mongoUri) {
    errors.push('MONGO_URI is required');
  }

  // If emails are enabled, validate email config
  if (config.emailEnabled) {
    if (!config.smtpHost || !config.smtpPort) {
      errors.push('SMTP_HOST and SMTP_PORT are required when EMAIL_ENABLED is true');
    }
    if (!(config.smtpUser || config.emailUser) || !(config.smtpPass || config.emailPass)) {
      errors.push('SMTP_USER/SMTP_PASS are required when EMAIL_ENABLED is true');
    }
  }

  // If SMS is enabled, validate SMS config
  if (config.smsEnabled && config.smsProvider === 'twilio') {
    if (!config.smsTwilioAccountSID || !config.smsTwilioAuthToken) {
      errors.push('SMS_ACCOUNT_SID and SMS_AUTH_TOKEN are required when SMS_ENABLED is true');
    }
    if (!config.smsTwilioPhoneNumber) {
      errors.push('SMS_PHONE_NUMBER is required when SMS_ENABLED is true');
    }
  }

  if (errors.length > 0) {
    console.error('❌ Configuration Errors:');
    errors.forEach((error) => console.error(`   - ${error}`));

  }
};

/**
 * Get configuration instance (singleton)
 */
let configInstance: Config | null = null;

export const config = (): Config => {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
};

/**
 * Reload configuration (useful for testing)
 */
export const reloadConfig = (): void => {
  configInstance = null;
};
