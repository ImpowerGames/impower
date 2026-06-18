import { PreactComponent } from "@impower/impower-ui/preact";
import SparkdownScreenplayPreview, {
  propDefaults,
} from "./SparkdownScreenplayPreview";

export const SparkdownScreenplayPreviewElement = PreactComponent(
  SparkdownScreenplayPreview,
  "sparkdown-screenplay-preview",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-screenplay-preview": HTMLElement;
  }
}
