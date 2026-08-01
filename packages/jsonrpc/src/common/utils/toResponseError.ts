import { ResponseError } from "../types/ResponseError";

/** JSON-RPC 2.0 "Internal error". */
export const INTERNAL_ERROR = -32603;

// `String(e)` is not safe on arbitrary values: it throws for symbols and for
// objects with a null prototype or a hostile `toString`. This must never throw
// — it runs inside the catch that produces the error response, so a throw here
// means no response is sent at all and the caller hangs, which is the very bug
// this file exists to prevent.
const describe = (e: unknown): string => {
  try {
    return String(e);
  } catch {
    return "unknown error";
  }
};

/**
 * Coerce anything a handler threw into a `ResponseError`. Total by construction.
 *
 * A response carries either `result` or `error`, and the requester only settles
 * when one of them is present — so a throw that failed to produce an error
 * object left the caller waiting forever.
 */
export const toResponseError = (e: unknown): ResponseError => {
  // Errors (including DOMException) carry a legacy numeric `code` that has
  // nothing to do with JSON-RPC — DataCloneError is 25, NotFoundError is 8 —
  // so never let one through as an error code.
  if (e instanceof Error) {
    return { code: INTERNAL_ERROR, message: e.message || describe(e) };
  }
  if (typeof e === "object" && e !== null) {
    let message: unknown;
    let code: unknown;
    let data: unknown;
    try {
      ({ message, code, data } = e as Record<string, unknown>);
    } catch {
      // A hostile or revoked proxy — fall through to the generic shape.
    }
    if (typeof message === "string") {
      return {
        code: typeof code === "number" ? code : INTERNAL_ERROR,
        message,
        ...(data !== undefined ? { data: data as never } : {}),
      };
    }
  }
  return { code: INTERNAL_ERROR, message: describe(e) };
};
