type SpRequestCloseEvent = CustomEvent<{
  source: "close-button" | "keyboard" | "overlay";
}>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-request-close": SpRequestCloseEvent;
  }
}

export default SpRequestCloseEvent;
