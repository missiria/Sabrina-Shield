import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ShieldError, toResponseBody } from '@eksneks/core';

/**
 * Translates any {@link ShieldError} into the standardized JSON response
 * `{ success: false, code, message }` with the error's HTTP status. Re-attaches
 * `Retry-After` for rate-limit rejections when available.
 */
@Catch(ShieldError)
export class ShieldExceptionFilter implements ExceptionFilter {
  catch(error: ShieldError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Record<string, any>>();

    const retryAfterMs = error.metadata.retryAfterMs;
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
      const retrySec = String(Math.ceil(retryAfterMs / 1000));
      if (typeof res.header === 'function') res.header('Retry-After', retrySec);
      else if (typeof res.setHeader === 'function') res.setHeader('Retry-After', retrySec);
    }

    const body = toResponseBody(error);
    // Express: res.status().json(); Fastify: reply.status().send()
    if (typeof res.status === 'function') {
      const staged = res.status(error.status);
      if (typeof staged.json === 'function') staged.json(body);
      else if (typeof staged.send === 'function') staged.send(body);
    } else if (typeof res.code === 'function') {
      res.code(error.status).send(body);
    }
  }
}
