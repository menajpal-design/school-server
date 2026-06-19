import Joi from 'joi';
import { NextFunction, Request, Response } from 'express';

export const mongoId = Joi.string().hex().length(24);

export const validateBody = (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.context?.key,
      message: detail.message.replace(/"/g, ''),
    }));
    console.error('Validation error:', { body: req.body, errors });
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors,
      details: { 
        body: Object.keys(req.body),
        received: req.body
      }
    });
  }
  req.body = value;
  next();
};
