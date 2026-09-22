import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * One structured log line per request, with a correlation id.
 *
 * Deliberately dependency-free (no morgan/pino): Section 9's "add complexity
 * only when there is a reason" applies to logging too, and this is enough to
 * follow a ride through the lifecycle. The id is echoed in the `x-request-id`
 * response header and included in unhandled-error logs, so a 500 reported by
 * the UI can be traced back to the exact request that produced it.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  const requestId = randomUUID();
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // req.auth is populated by requireAuth during the request, so it is read
    // here on 'finish' rather than up front.
    const actor = req.auth ? `${req.auth.role}:${req.auth.userId.slice(0, 8)}` : 'anonymous';

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        actor,
      })
    );
  });

  next();
}
