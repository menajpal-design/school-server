import bcrypt from 'bcryptjs';
import User from '../models/User';

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);

export const generatePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let value = '';
  for (let i = 0; i < 10; i += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return value;
};

export const generateUsername = async (name: string, prefix = 'user') => {
  const base = clean(name) || prefix;
  for (let i = 0; i < 20; i += 1) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const username = `${base}${suffix}`;
    const exists = await User.exists({ username });
    if (!exists) return username;
  }
  return `${prefix}${Date.now()}`;
};

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
