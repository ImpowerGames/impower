import { RangeValue } from "@codemirror/state";

export class SparkdownAnnotation<T = unknown> extends RangeValue {
  type: T;

  constructor(type: T) {
    super();
    this.type = type;
  }

  static mark<T>(type: T = undefined as T): SparkdownAnnotation<T> {
    return new SparkdownAnnotation<T>(type);
  }
}
