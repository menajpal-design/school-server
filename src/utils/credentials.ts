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
  for (let i = 0; i < 30; i += 1) {
    const timePart = Date.now().toString(36).slice(-6);
    const randomPart = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 8);
    const username = `${base}${timePart}${randomPart}`.slice(0, 28);
    const exists = await User.exists({ username });
    if (!exists) return username;
  }
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 28);
};

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
