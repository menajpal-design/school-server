import path from 'path';
import dotenv from 'dotenv';

const loadedPaths = new Set<string>();

const loadEnvFile = (envPath: string) => {
  if (loadedPaths.has(envPath)) return;
  loadedPaths.add(envPath);
  dotenv.config({ path: envPath, override: true });
};

export const loadEnv = () => {
  // Keep .env as the only app env file. Do not load .production.env.
  loadEnvFile(path.resolve(process.cwd(), '.env'));
  loadEnvFile(path.resolve(__dirname, '..', '.env'));
  loadEnvFile(path.resolve(__dirname, '..', '..', '.env'));
};

loadEnv();
