import express from 'express';
import { authenticate } from '../middleware/auth';
import Committee from '../models/Committee';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  Committee.find({ institutionId: req.user.institutionId })
    .populate('chairmanId', 'name email role')
    .populate('members', 'name email role')
    .sort({ createdAt: -1 })
    .then((committee) => res.json({ committee }))
    .catch((error) => res.status(500).json({ message: 'Failed to load committee data', error }));
});

router.get('/:id', authenticate, (req, res) => {
  Committee.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
    .populate('chairmanId', 'name email role')
    .populate('members', 'name email role')
    .then((committee) => {
      if (!committee) return res.status(404).json({ message: 'Committee not found' });
      res.json({ committee });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load committee', error }));
});

router.post('/', authenticate, async (req, res) => {
  try {
    const committee = await Committee.create({
      ...req.body,
      formationDate: req.body.formationDate || new Date(),
      members: req.body.members || [],
      responsibilities: Array.isArray(req.body.responsibilities)
        ? req.body.responsibilities
        : String(req.body.responsibilities || '').split(',').map((item) => item.trim()).filter(Boolean),
      agenda: req.body.agenda,
      minutes: req.body.minutes,
      meetingAttendance: req.body.meetingAttendance || [],
      institutionId: req.user.institutionId,
    });
    const populated = await Committee.findById(committee._id)
      .populate('chairmanId', 'name email role')
      .populate('members', 'name email role');
    res.status(201).json({ committee: populated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create committee', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const committee = await Committee.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      {
        ...req.body,
        responsibilities: Array.isArray(req.body.responsibilities)
          ? req.body.responsibilities
          : String(req.body.responsibilities || '').split(',').map((item) => item.trim()).filter(Boolean),
        agenda: req.body.agenda,
        minutes: req.body.minutes,
        meetingAttendance: req.body.meetingAttendance || [],
      },
      { new: true }
    )
      .populate('chairmanId', 'name email role')
      .populate('members', 'name email role');
    if (!committee) return res.status(404).json({ message: 'Committee not found' });
    res.json({ committee });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update committee', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const committee = await Committee.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!committee) return res.status(404).json({ message: 'Committee not found' });
    await committee.deleteOne();
    res.json({ message: 'Committee deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete committee', error });
  }
});

export default router;
