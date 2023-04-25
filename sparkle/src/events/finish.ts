type SpFinishEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-finish": SpFinishEvent;
  }
}

export default SpFinishEvent;
