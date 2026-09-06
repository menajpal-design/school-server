import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import QuestionBank from '../models/QuestionBank';
import Student from '../models/Student';

const router = express.Router();
const manageRoles = ['head', 'assistant_head', 'teacher', 'class_teacher', 'subject_teacher'];
const practiceRoles = [...manageRoles, 'student', 'parent'];
const canManage = (role: string) => manageRoles.includes(normalizeRole(role));
const canPractice = (role: string) => practiceRoles.includes(normalizeRole(role));

const sampleQuestions = (body: any) => {
  const count = Math.max(1, Math.min(100, Number(body.count || 10)));
  return Array.from({ length: count }).map((_, i) => {
    const isQuestion = body.mode === 'question';
    return {
      type: isQuestion ? 'cq' : 'mcq',
      question: isQuestion
        ? `${i + 1}. ${body.subjectName || body.subject || 'Subject'} - ${body.syllabus || 'syllabus'} থেকে একটি সৃজনশীল/CQ প্রশ্ন তৈরি করুন।\nক) জ্ঞানমূলক প্রশ্ন\nখ) অনুধাবনমূলক প্রশ্ন\nগ) প্রয়োগমূলক প্রশ্ন\nঘ) উচ্চতর দক্ষতামূলক প্রশ্ন`
        : `${i + 1}. ${body.subjectName || body.subject || 'Subject'} - ${body.syllabus || 'syllabus'} MCQ question?`,
      options: isQuestion ? [] : ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
      answer: isQuestion ? 'Teacher verification required' : 'A',
      marks: Number(body.markPerQuestion || (isQuestion ? 10 : 1)),
    };
  });
};

const extractJson = (text: string) => {
  const cleaned = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
};

const geminiQuestions = async (body: any) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return { source: 'server-fallback', questions: sampleQuestions(body) };
  const isQuestion = body.mode === 'question';
  const prompt = isQuestion
    ? `Return JSON only. JSON shape: {"questions":[{"type":"cq","question":"Creative question stem and sub questions ক খ গ ঘ","options":[],"answer":"Teacher verification required","marks":10}]}. Make ${Number(body.count || 8)} Bengali CQ/Creative Questions. Every question must include ক) জ্ঞানমূলক, খ) অনুধাবনমূলক, গ) প্রয়োগমূলক, ঘ) উচ্চতর দক্ষতামূলক sub-questions. Class: ${body.className || ''}. Subject: ${body.subjectName || body.subject || ''}. Syllabus: ${body.syllabus || ''}. Language: ${body.language || 'Bangla'}.`
    : `Return JSON only. JSON shape: {"questions":[{"type":"mcq","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A","marks":1}]}. Make ${Number(body.count || 10)} MCQ questions. Class: ${body.className || ''}. Subject: ${body.subjectName || body.subject || ''}. Syllabus: ${body.syllabus || ''}. Language: ${body.language || 'Bangla'}.`;

  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-2.5-flash',
  ].filter(Boolean) as string[];

  for (const model of modelsToTry) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, responseMimeType: 'application/json' } }),
      });
      const data: any = await response.json();
      if (!response.ok) continue;

      const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join('\n') || '';
      const parsed = extractJson(text);
      const questions = Array.isArray(parsed?.questions) && parsed.questions.length ? parsed.questions : sampleQuestions(body);
      return { source: model, questions };
    } catch {
      continue;
    }
  }

  return { source: 'server-fallback', questions: sampleQuestions(body) };
};

router.post('/generate', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher, head or assistant head can generate questions.' });
    return res.json(await geminiQuestions(req.body || {}));
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to generate questions' });
  }
});

router.get('/sets', authenticate, async (req: any, res) => {
  try {
    if (!canPractice(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const q: any = { institutionId: req.user.institutionId };
    if (req.query.mode) q.mode = req.query.mode;
    if (req.query.classId) q.classId = req.query.classId;
    if (req.query.subjectId) q.subjectId = req.query.subjectId;
    if (!canManage(req.user.role)) q.isPublished = true;
    const sets = await QuestionBank.find(q).populate('classId', 'name grade').populate('subjectId', 'name code').sort({ createdAt: -1 }).lean();
    return res.json({ sets });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load question sets', error });
  }
});

router.post('/sets', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher, head or assistant head can save question sets.' });
    const body = req.body || {};
    const questions = Array.isArray(body.questions) && body.questions.length ? body.questions : sampleQuestions(body);
    const set = await QuestionBank.create({
      title: String(body.title || `${body.className || 'Class'} ${body.subjectName || body.subject || 'Subject'} Question Set`).trim(),
      mode: body.mode === 'question' ? 'question' : 'mcq',
      classId: body.classId || undefined,
      subjectId: body.subjectId || undefined,
      className: body.className,
      subjectName: body.subjectName || body.subject,
      syllabus: body.syllabus,
      duration: body.duration || '30 minutes',
      totalMarks: Number(body.totalMarks || questions.length),
      rollRequired: body.rollRequired !== false,
      isPublished: body.isPublished === true,
      questions,
      createdBy: req.user._id,
      institutionId: req.user.institutionId,
    });
    return res.status(201).json({ message: 'Question set saved.', set });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save question set', error });
  }
});

router.patch('/sets/:id/publish', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher, head or assistant head can publish MCQ.' });
    const set = await QuestionBank.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { isPublished: req.body?.isPublished !== false }, { new: true });
    if (!set) return res.status(404).json({ message: 'Question set not found.' });
    return res.json({ message: 'Publish status updated.', set });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to publish question set', error });
  }
});

router.post('/sets/:id/mark', authenticate, async (req: any, res) => {
  try {
    if (!canPractice(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const set: any = await QuestionBank.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).lean();
    if (!set) return res.status(404).json({ message: 'Question set not found.' });
    const answers = { ...(req.body.answers || {}) };
    String(req.body.answersText || req.body.scanText || '').toUpperCase().split(/[\s,;]+/).filter(Boolean).forEach((token) => {
      const match = token.match(/^(\d+)[\.:-]?([A-D])$/);
      if (match) answers[match[1]] = match[2];
    });
    let score = 0;
    const details = (set.questions || []).map((q: any, i: number) => {
      const key = String(i + 1);
      const expected = String(q.answer || '').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
      const given = String(answers[key] || '').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
      const correct = Boolean(expected && given === expected);
      const marks = correct ? Number(q.marks || 1) : 0;
      score += marks;
      return { questionNo: i + 1, given, expected, correct, marks };
    });
    return res.json({ rollNumber: req.body.rollNumber || '', total: set.questions.length, score, details });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to mark MCQ', error });
  }
});

router.get('/practice/me', authenticate, async (req: any, res) => {
  try {
    if (!canPractice(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const q: any = { institutionId: req.user.institutionId, mode: 'mcq', isPublished: true };
    if (normalizeRole(req.user.role) === 'student') {
      const student: any = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
      if (student?.classId) q.classId = student.classId;
    }
    const sets = await QuestionBank.find(q).select('-questions.answer').populate('classId', 'name grade').populate('subjectId', 'name code').sort({ createdAt: -1 }).lean();
    return res.json({ sets });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load practice MCQ', error });
  }
});

export default router;
