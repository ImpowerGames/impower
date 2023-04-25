type SpErrorEvent = CustomEvent<{ status?: number }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-error": SpErrorEvent;
  }
}

export default SpErrorEvent;
