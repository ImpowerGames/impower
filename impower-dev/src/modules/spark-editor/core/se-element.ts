import SparkElement from "../../../../../packages/spark-element/src/core/spark-element";
import coreCSS from "../styles/core/core.css";
import normalizeCSS from "../styles/normalize/normalize.css";

export default class SEElement extends SparkElement {
  override get sharedStyles(): string[] {
    return [...super.sharedStyles, normalizeCSS, coreCSS];
  }
}
