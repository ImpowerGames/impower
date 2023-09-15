const emit = <T>(event: string, detail: T, target: EventTarget) =>
  target.dispatchEvent(
    new CustomEvent(event, {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail,
    })
  );

export default emit;
