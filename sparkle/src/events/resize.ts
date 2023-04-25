type SpResizeEvent = CustomEvent<{ entries: ResizeObserverEntry[] }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-resize": SpResizeEvent;
  }
}

export default SpResizeEvent;
