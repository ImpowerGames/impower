import { useEffect, useState } from "preact/hooks";

/**
 * Keep an element mounted across its enter AND exit transition. Returns
 * `mounted` (true from the moment `open` flips true until `durationMs` after it
 * flips false) and `visible` (true one frame after mount, for class-driven CSS
 * transitions). Use `mounted` to gate rendering; drive the animation either off
 * `visible` (CSS transition) or — for Radix `forceMount` content — off the
 * primitive's own `data-state` (keyframe). The delayed unmount is what gives a
 * reliable exit animation without depending on Radix's Presence.
 */
export function useMountTransition(open: boolean, durationMs: number) {
  const [mounted, setMounted] = useState(open);
  // Always start hidden so the enter transition plays even when the element
  // mounts already-open (e.g. a `defaultOpen` menu).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame (×2 so the browser has painted the mounted-but-hidden state)
      // flip `visible` so a CSS transition has a start → end to interpolate.
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted, visible };
}

export default useMountTransition;
