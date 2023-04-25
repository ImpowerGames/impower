type SpAfterShowEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-after-show": SpAfterShowEvent;
  }
}

export default SpAfterShowEvent;
