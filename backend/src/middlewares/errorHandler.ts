import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (axios.isAxiosError(err) && err.response?.status === 401) {
    statusCode = 401;
    message = 'Blizzard session expired, please log in again';
  }

  console.error(`[Error] ${statusCode} - ${message}`);
  if (statusCode === 500 && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
