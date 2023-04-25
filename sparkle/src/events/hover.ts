type SpHoverEvent = CustomEvent<{
  phase: "start" | "move" | "end";
  value: number;
}>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-hover": SpHoverEvent;
  }
}

export default SpHoverEvent;
