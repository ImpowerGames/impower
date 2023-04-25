type SpAfterCollapseEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-after-collapse": SpAfterCollapseEvent;
  }
}

export default SpAfterCollapseEvent;
