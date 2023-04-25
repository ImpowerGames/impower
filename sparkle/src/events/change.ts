type SpChangeEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-change": SpChangeEvent;
  }
}

export default SpChangeEvent;
