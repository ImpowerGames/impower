type SpRemoveEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-remove": SpRemoveEvent;
  }
}

export default SpRemoveEvent;
