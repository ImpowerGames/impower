type SpRepositionEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-reposition": SpRepositionEvent;
  }
}

export default SpRepositionEvent;
