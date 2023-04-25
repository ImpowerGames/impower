type SpLazyLoadEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-lazy-load": SpLazyLoadEvent;
  }
}

export default SpLazyLoadEvent;
