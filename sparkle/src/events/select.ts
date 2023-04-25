import type SpMenuItem from "../components/menu-item/menu-item";

type SpSelectEvent = CustomEvent<{ item: SpMenuItem }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-select": SpSelectEvent;
  }
}

export default SpSelectEvent;
