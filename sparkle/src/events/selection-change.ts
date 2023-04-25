import type SpTreeItem from "../components/tree-item/tree-item";

type SpSelectionChangeEvent = CustomEvent<{ selection: SpTreeItem[] }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-selection-change": SpSelectionChangeEvent;
  }
}

export default SpSelectionChangeEvent;
