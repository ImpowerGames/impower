type SpAfterExpandEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-after-expand": SpAfterExpandEvent;
  }
}

export default SpAfterExpandEvent;
