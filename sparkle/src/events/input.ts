type SpInputEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-input": SpInputEvent;
  }
}

export default SpInputEvent;
