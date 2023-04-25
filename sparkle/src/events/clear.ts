type SpClearEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-clear": SpClearEvent;
  }
}

export default SpClearEvent;
