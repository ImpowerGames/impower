import type { Ref } from "preact";
import { useCallback, useLayoutEffect, useRef } from "preact/hooks";

const assign = <T>(target: Ref<T> | null | undefined, element: T | null) => {
  if (typeof target === "function") {
    target(element);
  } else if (target) {
    (target as { current: T | null }).current = element;
  }
};

export function useForwardedRef<T>(
  ref: Ref<T> | null | undefined,
  own?: (element: T | null) => void,
): (element: T | null) => void {
  const latest = useRef({ ref, own });
  const attached = useRef<T | null>(null);
  const assigned = useRef<Ref<T> | null | undefined>(ref);
  latest.current = { ref, own };

  useLayoutEffect(() => {
    const previous = assigned.current;
    if (previous === ref) {
      return;
    }
    assigned.current = ref;
    if (typeof previous === "function" && typeof ref === "function") {
      return;
    }
    if (attached.current !== null) {
      assign(previous, null);
      assign(ref, attached.current);
    }
  });

  return useCallback((element: T | null) => {
    attached.current = element;
    latest.current.own?.(element);
    assign(latest.current.ref, element);
    assigned.current = latest.current.ref;
  }, []);
}
