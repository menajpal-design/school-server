import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import Institution from '../models/Institution';
import { generateUsername } from '../utils/credentials';

const jwtSecret = () => process.env.JWT_SECRET || 'your_super_secret_key_with_at_least_32_characters_1234567890';

const buildAuthPayload = (message: string, token: string, user: any) => ({
  success: true,
  message,
  token,
  user,
  data: {
    token,
    user,
  },
});

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, phone } = req.body;
    const name = (req.body.name || `${req.body.firstName || ''} ${req.body.lastName || ''}`).trim();
    const role = 'head';
    let institutionId = req.body.institutionId;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userId = new mongoose.Types.ObjectId();

    if (!institutionId) {
      const institution = await Institution.create({
        name: req.body.institutionName || `${name}'s Institution`,
        type: 'school',
        address: 'Not provided',
        phone: phone || 'Not provided',
        email,
        headId: userId,
        settings: {
          backupSettings: {
            frequency: 'weekly',
            location: 'local',
            collections: [],
          },
        },
      });
      institutionId = institution._id;
    }

    // Create user
    const user = new User({
      _id: userId,
      name,
      username: await generateUsername(name, 'head'),
      email,
      password: hashedPassword,
      role,
      phone,
      institutionId
    });

    await user.save();
    const populatedUser = await User.findById(user._id).populate('institutionId');

    // Generate token
    const token = jwt.sign({ id: user._id }, jwtSecret(), {
      expiresIn: '7d'
    });

    const responseUser = {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isActive: user.isActive,
        permissions: user.permissions || [],
        institutionId,
        institution: populatedUser?.institutionId || institutionId
    };

    res.status(201).json(buildAuthPayload('User registered successfully', token, responseUser));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const identifier = (req.body.username || req.body.email || req.body.identifier || '').trim();
    const { password } = req.body;

    // Validate input
    if (!identifier || !password) {
      return res.status(400).json({ 
        message: 'Email/mobile and password are required',
        details: { identifier: !identifier ? 'missing' : 'ok', password: !password ? 'missing' : 'ok' }
      });
    }

    // Find user
    const emailQuery = identifier.includes('@') ? identifier.toLowerCase() : identifier;
    const user = await User.findOne({
      $or: [
        { email: emailQuery },
        { username: emailQuery.toLowerCase() },
        { phone: identifier },
      ],
    }).populate('institutionId');
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign({ id: user._id }, jwtSecret(), {
      expiresIn: '7d'
    });

    const responseUser = {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isActive: user.isActive,
        permissions: user.permissions || [],
        institutionId: (user.institutionId as any)?._id || user.institutionId,
        institution: user.institutionId
    };

    res.json(buildAuthPayload('Login successful', token, responseUser));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await User.findById((req as any).user._id).populate('institutionId');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        institutionId: (user.institutionId as any)?._id || user.institutionId,
        institution: user.institutionId,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findById((req as any).user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById((req as any).user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};
