type SpFocusEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-focus": SpFocusEvent;
  }
}

export default SpFocusEvent;
