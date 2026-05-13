import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().min(2),
  firstName: Joi.string().min(1),
  lastName: Joi.string().allow('', null),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('head').default('head'),
  phone: Joi.string().allow('', null),
  institutionId: Joi.string().hex().length(24).allow('', null),
  institutionName: Joi.string().min(2).allow('', null),
  planCode: Joi.string().valid('students_100', 'students_200', 'students_300', 'students_500', 'students_1000').allow('', null),
  billingCycle: Joi.string().valid('monthly', 'yearly').default('monthly'),
  paymentGateway: Joi.string().allow('', null),
  paymentTrxId: Joi.string().allow('', null),
  paymentSenderNumber: Joi.string().allow('', null),
  receivedAmount: Joi.number().allow('', null),
}).or('name', 'firstName');

export const loginSchema = Joi.object({
  email: Joi.string().email(),
  identifier: Joi.string().min(2),
  username: Joi.string().min(2),
  password: Joi.string().required(),
}).or('email', 'identifier', 'username');

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});
