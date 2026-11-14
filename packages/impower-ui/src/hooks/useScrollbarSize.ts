import { useLayoutEffect } from "preact/hooks";
import { connectScrollbarSize } from "../layout/scrollbar";

export function useScrollbarSize(): void {
  useLayoutEffect(connectScrollbarSize, []);
}
