import { profile } from "./profile";

export const profiled = <T>(
  method: string,
  uri: string | undefined,
  fn: () => T,
): T => {
  profile("start", method, uri);
  let deferred = false;
  try {
    const result = fn();
    // workaround(vscode-jsonrpc): handler returns are typed PromiseLike declaring only then, so gate on then and adopt with Promise.resolve
    if (result && typeof (result as { then?: unknown }).then === "function") {
      const settled = Promise.resolve(result).finally(() => {
        profile("end", method, uri);
      });
      deferred = true;
      return settled as T;
    }
    return result;
  } finally {
    if (!deferred) {
      profile("end", method, uri);
    }
  }
};
