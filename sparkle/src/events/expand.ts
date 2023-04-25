type SpExpandEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-expand": SpExpandEvent;
  }
}

export default SpExpandEvent;
