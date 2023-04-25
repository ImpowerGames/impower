type SpHideEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-hide": SpHideEvent;
  }
}

export default SpHideEvent;
