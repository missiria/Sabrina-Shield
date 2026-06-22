import { ShieldError } from './shield-error';

/** Standardized error response body shape. */
export interface ShieldResponseBody {
  success: false;
  code: string;
  message: string;
}

/**
 * Map a {@link ShieldError} to the standardized JSON body returned to clients.
 * Single source of truth reused by every framework adapter's exception handler.
 */
export function toResponseBody(error: ShieldError): ShieldResponseBody {
  return {
    success: false,
    code: error.code,
    message: error.message,
  };
}
