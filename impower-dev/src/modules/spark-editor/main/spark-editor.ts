import { Component } from "../../../../../packages/spec-component/src/component";
import spec from "./_spark-editor";

export default class SparkEditor extends Component(spec) {
  constructor() {
    super();
    this.childNodes.forEach((n) => {
      n.remove();
    });
  }
}
