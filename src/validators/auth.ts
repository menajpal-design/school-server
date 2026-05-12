import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().min(2),
  firstName: Joi.string().min(1),
  lastName: Joi.string().allow('', null),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('head', 'assistant_head', 'class_teacher', 'subject_teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member', 'teacher').required(),
  phone: Joi.string().allow('', null),
  institutionId: Joi.string().hex().length(24).allow('', null),
  institutionName: Joi.string().min(2).allow('', null),
}).or('name', 'firstName');

export const loginSchema = Joi.object({
  email: Joi.string().email(),
  identifier: Joi.string().min(2),
  password: Joi.string().required(),
}).or('email', 'identifier');

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});
