import { useEffect, useState } from "preact/hooks";

/**
 * Mount/unmount with both an ENTER and an EXIT transition — the piece preact
 * gives you for free (conditional render) can't do, since unmounting is instant.
 *
 * Returns `{ mounted, visible }`:
 *  - render the node only while `mounted` is true;
 *  - drive the "shown" vs "hidden" CSS classes off `visible`.
 *
 * On open: mount immediately (in the hidden state), then flip `visible` true on
 * the next frame so the transition runs. On close: flip `visible` false (exit
 * transition), then unmount after `durationMs` (match your CSS duration).
 */
export function useMountTransition(open: boolean, durationMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the node must paint in its "from" state before we flip to
      // the "to" state, or the browser coalesces both and skips the transition.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted, visible };
}
