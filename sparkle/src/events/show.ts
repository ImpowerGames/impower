type SpShowEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-show": SpShowEvent;
  }
}

export default SpShowEvent;
