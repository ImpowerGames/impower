type SpStartEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-start": SpStartEvent;
  }
}

export default SpStartEvent;
