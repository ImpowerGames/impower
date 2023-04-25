type SpLoadEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-load": SpLoadEvent;
  }
}

export default SpLoadEvent;
