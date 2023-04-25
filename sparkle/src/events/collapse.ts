type SpCollapseEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-collapse": SpCollapseEvent;
  }
}

export default SpCollapseEvent;
