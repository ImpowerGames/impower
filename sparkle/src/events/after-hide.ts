type SpAfterHideEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-after-hide": SpAfterHideEvent;
  }
}

export default SpAfterHideEvent;
