const DEFAULT_INIT: CustomEventInit = {
  bubbles: true,
  cancelable: false,
  composed: true,
  detail: {},
};

export default class SparkleEvent<T = any> extends CustomEvent<T> {
  constructor(type: string, eventInitDict?: CustomEventInit<T>) {
    const init = eventInitDict
      ? { ...DEFAULT_INIT, ...eventInitDict }
      : DEFAULT_INIT;
    super(type, init);
  }
}
