type SpInitialFocusEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-initial-focus": SpInitialFocusEvent;
  }
}

export default SpInitialFocusEvent;
