import SparkElement from "../../../spark-element/src/spark-element";
import coreCSS from "../styles/core/core.css";
import normalizeCSS from "../styles/normalize/normalize.css";

export default class SEElement extends SparkElement {
  override get sharedStyles(): string[] {
    return [normalizeCSS, coreCSS];
  }

  override focus(options?: FocusOptions | undefined): void {
    this.selfChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.focus(options);
      }
    });
    this.assignedChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.focus(options);
      }
    });
  }

  override blur(): void {
    this.selfChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.blur();
      }
    });
    this.assignedChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.blur();
      }
    });
  }
}
