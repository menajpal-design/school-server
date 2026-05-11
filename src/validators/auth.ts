import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('head', 'assistant_head', 'class_teacher', 'subject_teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member').required(),
  phone: Joi.string().allow('', null),
  institutionId: Joi.string().hex().length(24).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});
