type SpBlurEvent = CustomEvent<Record<PropertyKey, never>>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-blur": SpBlurEvent;
  }
}

export default SpBlurEvent;
