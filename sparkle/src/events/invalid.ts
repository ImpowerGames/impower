type SpInvalidEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-invalid": SpInvalidEvent;
  }
}

export default SpInvalidEvent;
