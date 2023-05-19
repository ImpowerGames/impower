export default class SparkleEvent<T = any> extends CustomEvent<T> {
  constructor(type: string, eventInitDict?: CustomEventInit<T>) {
    const defaultInit: CustomEventInit = {
      bubbles: true,
      cancelable: false,
      composed: true,
      detail: {},
    };
    const init = eventInitDict
      ? { ...defaultInit, ...eventInitDict }
      : defaultInit;
    super(type, init);
  }
}
