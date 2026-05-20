import { PreactComponent } from "@impower/impower-ui/preact";
import FileDropzone, { propDefaults } from "./FileDropzone";

export const FileDropzoneElement = PreactComponent(
  FileDropzone,
  "se-file-dropzone",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-file-dropzone": HTMLElement;
  }
}
