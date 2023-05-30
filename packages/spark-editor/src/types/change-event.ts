interface ChangeEvent extends CustomEvent<Record<PropertyKey, never>> {
  target: HTMLElement & { value: string | null };
}

declare global {
  interface GlobalEventHandlersEventMap {
    onchange: ChangeEvent;
  }
}

export default ChangeEvent;
