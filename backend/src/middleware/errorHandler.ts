import { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // Unexpected failures get logged with the same request id the client saw in
  // the x-request-id header, so a bug report can be traced to one request.
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: 'error',
      requestId: res.getHeader('x-request-id'),
      method: req.method,
      path: req.originalUrl,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  );
  return res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}
