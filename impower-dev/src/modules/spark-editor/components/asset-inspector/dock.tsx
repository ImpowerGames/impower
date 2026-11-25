import { cn, useMountTransition } from "@impower/impower-ui/components";
import type { Layout } from "@impower/impower-ui/layout";
import { createContext, type ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useContext, useState } from "preact/hooks";

export type InspectorHost = "dock" | "sheet";

export const inspectorHost = (layout: Layout, dock: HTMLElement | null): InspectorHost =>
  layout === "desktop" && dock ? "dock" : "sheet";

export const DOCKED_INSPECTOR_FADE_MS = 150;

const DockContext = createContext<{
  dock: HTMLElement | null;
  setDock: (element: HTMLElement | null) => void;
}>({ dock: null, setDock: () => {} });

export function InspectorDockProvider({ children }: { children: ComponentChildren }) {
  const [dock, setDock] = useState<HTMLElement | null>(null);
  return <DockContext.Provider value={{ dock, setDock }}>{children}</DockContext.Provider>;
}

export function InspectorDock() {
  const { setDock } = useContext(DockContext);
  return <div ref={setDock} data-inspector-dock class="absolute inset-0 z-10 empty:hidden" />;
}

export const useInspectorDock = () => useContext(DockContext).dock;

export function DockedInspector({
  dock,
  open,
  children,
}: {
  dock: HTMLElement;
  open: boolean;
  children?: ComponentChildren;
}) {
  const { mounted, visible } = useMountTransition(open, DOCKED_INSPECTOR_FADE_MS);
  if (!mounted) {
    return null;
  }
  return createPortal(
    <div
      data-docked-inspector={visible ? "shown" : "hidden"}
      inert={!open}
      class={cn(
        "h-full motion-safe:transition-opacity motion-safe:duration-150",
        visible
          ? "opacity-100 ease-[ease-out]"
          : "pointer-events-none opacity-0 ease-[ease-in] motion-reduce:invisible",
      )}
    >
      {children}
    </div>,
    dock,
  );
}
