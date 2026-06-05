import express from 'express';
import { authenticate } from '../middleware/auth';
import ClassModel from '../models/Class';
import Subject from '../models/Subject';
import Exam from '../models/Exam';
import Result from '../models/Result';

const router = express.Router();
const overviewRoles = ['head', 'assistant_head', 'admin', 'super_admin'];

router.get('/', authenticate, async (req: any, res) => {
  try {
    if (!overviewRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Academic overview is restricted to school leaders/admins.' });
    }
    const institutionId = req.user.institutionId;
    const [classes, subjects, exams, results] = await Promise.all([
      ClassModel.find({ institutionId }).sort({ createdAt: -1 }).lean(),
      Subject.find({ institutionId }).sort({ createdAt: -1 }).lean(),
      Exam.find({ institutionId }).sort({ createdAt: -1 }).lean(),
      Result.find({ institutionId }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ classes, subjects, exams, results });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load academic overview', error });
  }
});

export default router;
