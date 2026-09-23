import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/** Erreur métier transportant un statut HTTP et un code stable exploitable par le frontend. */
export class HttpError extends Error implements AppError {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
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
    ...(err instanceof HttpError && err.code && { code: err.code }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
