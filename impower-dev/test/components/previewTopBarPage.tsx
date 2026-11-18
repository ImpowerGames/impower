import { render } from "preact";
import PreviewTopBar from "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar";

declare global {
  interface Window {
    previewTopBar: { mount: () => void };
  }
}

window.previewTopBar = {
  mount: () => {
    const host = document.body.appendChild(document.createElement("div"));
    host.id = "host";
    render(<PreviewTopBar />, host);
  },
};
