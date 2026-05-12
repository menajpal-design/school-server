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
  smsApiKey: string;
  smsApiUrl: string;
  smsTwilioAccountSID: string;
  smsTwilioAuthToken: string;
  smsTwilioPhoneNumber: string;

  // URLs
  frontendUrl: string;
  mobileUrl: string;
  androidUrl: string;
  staticServerUrl: string;
  allowedOrigins: string;
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
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/drms',
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
    smsProvider: process.env.SMS_PROVIDER || 'anoncify',
    smsApiKey: process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || '',
    smsApiUrl: process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms',
    smsTwilioAccountSID: process.env.SMS_ACCOUNT_SID || '',
    smsTwilioAuthToken: process.env.SMS_AUTH_TOKEN || '',
    smsTwilioPhoneNumber: process.env.SMS_PHONE_NUMBER || '',

    // URLs
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    mobileUrl: process.env.MOBILE_URL || 'http://localhost:8081',
    androidUrl: process.env.ANDROID_URL || 'http://localhost:8082',
    staticServerUrl: process.env.SERVER_URL || 'https://school-server-b264c1a1fac6.herokuapp.com',
    allowedOrigins: process.env.ALLOWED_ORIGINS || '',
  };

  // Validate critical configuration
  validateConfig(config);

  return config;
};

/**
 * Validate configuration
 */
export const validateConfig = (config: Config): void => {
  const criticalErrors: string[] = [];
  const warnings: string[] = [];

  // JWT Secret validation
  if (config.jwtSecret.length < 32) {
    warnings.push('JWT_SECRET should be at least 32 characters long');
  }

  // MongoDB URI validation
  if (!config.mongoUri) {
    warnings.push('MONGO_URI is missing; database features may not work');
  }

  // If emails are enabled, validate email config
  if (config.emailEnabled) {
    if (!config.smtpHost || !config.smtpPort) {
      warnings.push('SMTP_HOST and SMTP_PORT are required when EMAIL_ENABLED is true');
    }
    if (!config.emailUser || !config.emailPass) {
      warnings.push('EMAIL_USER and EMAIL_PASS are required when EMAIL_ENABLED is true');
    }
  }

  // If SMS is enabled, validate SMS config
  if (config.smsEnabled && config.smsProvider === 'anoncify') {
    if (!config.smsApiKey) {
      warnings.push('SMS_API_KEY (or ANONCIFY_SMS_API_KEY) is required when SMS_ENABLED is true');
    }
    if (!config.smsApiUrl) {
      warnings.push('SMS_API_URL is required when SMS_ENABLED is true');
    }
  }

  if (config.smsEnabled && config.smsProvider === 'twilio') {
    if (!config.smsTwilioAccountSID || !config.smsTwilioAuthToken) {
      warnings.push('SMS_ACCOUNT_SID and SMS_AUTH_TOKEN are required when SMS_ENABLED is true');
    }
    if (!config.smsTwilioPhoneNumber) {
      warnings.push('SMS_PHONE_NUMBER is required when SMS_ENABLED is true');
    }
  }

  if (warnings.length > 0) {
    console.warn('⚠️ Configuration Warnings:');
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  if (criticalErrors.length > 0) {
    console.error('❌ Configuration Errors:');
    criticalErrors.forEach((error) => console.error(`   - ${error}`));
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
