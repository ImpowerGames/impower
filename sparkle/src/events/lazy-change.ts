type SpLazyChangeEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-lazy-change": SpLazyChangeEvent;
  }
}

export default SpLazyChangeEvent;
