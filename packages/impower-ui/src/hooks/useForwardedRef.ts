import type { Ref } from "preact";
import { useCallback, useRef } from "preact/hooks";

export function useForwardedRef<T>(
  ref: Ref<T> | null | undefined,
  own?: (element: T | null) => void,
): (element: T | null) => void {
  const latest = useRef({ ref, own });
  latest.current = { ref, own };
  return useCallback((element: T | null) => {
    const { ref: target, own: mine } = latest.current;
    mine?.(element);
    if (typeof target === "function") {
      target(element);
    } else if (target) {
      (target as { current: T | null }).current = element;
    }
  }, []);
}
