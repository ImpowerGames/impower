type SpCloseEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-close": SpCloseEvent;
  }
}

export default SpCloseEvent;
