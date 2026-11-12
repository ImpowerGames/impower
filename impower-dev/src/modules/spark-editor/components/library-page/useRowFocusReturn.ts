import { useLayoutEffect, useState } from "preact/hooks";

export function useRowFocusReturn(row: (path: string) => HTMLElement | null) {
  const [path, setPath] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (path === null) {
      return;
    }
    row(path)?.focus({ preventScroll: true });
    setPath(null);
  }, [path]);
  return setPath;
}
