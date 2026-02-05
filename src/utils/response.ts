import { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  messageAr?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface ErrorResponse {
  success: false;
  error: string;
  errorAr: string;
  details?: unknown;
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCodeOrMessage?: number | string,
  metaOrMessageAr?: SuccessResponse<T>['meta'] | string
): Response<ApiResponse<T>> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  let statusCode = 200;

  if (typeof statusCodeOrMessage === 'string') {
    response.message = statusCodeOrMessage;
    if (typeof metaOrMessageAr === 'string') {
      response.messageAr = metaOrMessageAr;
    }
  } else if (typeof statusCodeOrMessage === 'number') {
    statusCode = statusCodeOrMessage;
    if (metaOrMessageAr && typeof metaOrMessageAr === 'object') {
      response.meta = metaOrMessageAr;
    }
  }

  return res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  error: string,
  errorAr: string,
  statusCode: number = 400,
  details?: unknown
): Response<ErrorResponse> {
  const response: ErrorResponse = {
    success: false,
    error,
    errorAr,
  };

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number
): Response<ApiResponse<T[]>> {
  return sendSuccess(res, data, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export default { sendSuccess, sendError, sendPaginated };
