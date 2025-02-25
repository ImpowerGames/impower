import { RangeValue } from "@codemirror/state";

export class SparkdownAnnotation<T = unknown> extends RangeValue {
  value: T;

  constructor(value: T) {
    super();
    this.value = value;
  }

  static mark<T>(value: T = undefined as T): SparkdownAnnotation<T> {
    return new SparkdownAnnotation<T>(value);
  }
}
