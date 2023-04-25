type SpTabShowEvent = CustomEvent<{ name: string }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-tab-show": SpTabShowEvent;
  }
}

export default SpTabShowEvent;
