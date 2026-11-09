import { useEffect, useState } from "preact/hooks";

let held = 0;
const listeners = new Set<(open: boolean) => void>();

const notify = () => {
  listeners.forEach((listener) => listener(held > 0));
};

export function holdSheetOpen(): () => void {
  held += 1;
  if (held === 1) {
    notify();
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    held -= 1;
    if (held === 0) {
      notify();
    }
  };
}

export function useSheetOpen(): boolean {
  const [open, setOpen] = useState(held > 0);

  useEffect(() => {
    setOpen(held > 0);
    listeners.add(setOpen);
    return () => {
      listeners.delete(setOpen);
    };
  }, []);

  return open;
}
