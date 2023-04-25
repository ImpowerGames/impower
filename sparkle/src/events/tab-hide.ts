type SpTabHideEvent = CustomEvent<{ name: string }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-tab-hide": SpTabHideEvent;
  }
}

export default SpTabHideEvent;
