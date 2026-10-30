import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_badge";
export default class Badge extends SparkleComponent(spec) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-badge": Badge;
  }
}
