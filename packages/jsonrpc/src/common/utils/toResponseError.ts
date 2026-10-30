import type { ResponseError } from "../types/ResponseError";

export const INTERNAL_ERROR = -32603;

const describe = (e: unknown): string => {
  try {
    return String(e);
  } catch {
    return "unknown error";
  }
};

export const toResponseError = (e: unknown): ResponseError => {
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
