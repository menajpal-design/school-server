import Joi from 'joi';
import { NextFunction, Request, Response } from 'express';

export const mongoId = Joi.string().hex().length(24);

export const validateBody = (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map((detail) => detail.message),
    });
  }
  req.body = value;
  next();
};
