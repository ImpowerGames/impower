type SpCancelEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-cancel": SpCancelEvent;
  }
}

export default SpCancelEvent;
