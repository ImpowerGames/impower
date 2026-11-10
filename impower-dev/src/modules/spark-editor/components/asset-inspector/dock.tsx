import type { Layout } from "@impower/impower-ui/layout";
import { createContext, type ComponentChildren } from "preact";
import { useContext, useState } from "preact/hooks";

export type InspectorHost = "dock" | "sheet";

export const inspectorHost = (layout: Layout, dock: HTMLElement | null): InspectorHost =>
  layout !== "phone" && dock ? "dock" : "sheet";

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
