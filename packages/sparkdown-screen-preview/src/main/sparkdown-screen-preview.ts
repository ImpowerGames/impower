import { Component } from "../../../spec-component/src/component";
import {
  parseSSL,
  RenderContext,
  renderHTML,
  renderStyles,
} from "../utils/parser";
import { throttle } from "../utils/throttle";
import spec from "./_sparkdown-screen-preview";

export default class SparkdownScreenPreview extends Component(spec) {
  _textDocument?: { uri: string };

  override onConnected() {
    window.addEventListener("jsonrpc", this.handleProtocol);
  }

  override onDisconnected() {
    window.removeEventListener("jsonrpc", this.handleProtocol);
  }

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (message.method === "load") {
        const { textDocument, text } = message.params;
        this._textDocument = textDocument;
        const input = text;
        const parsed = parseSSL(input);
        const stateInputEl = this.ref.state as HTMLInputElement;
        const update = throttle(() => {
          const ctx: RenderContext = {
            parsed,
            state: JSON.parse(stateInputEl.value || "{}"),
            renderStyles: () => {
              const styles = renderStyles(parsed, ctx);
              this.ref.styles.innerHTML = styles;
              console.log("STYLES!");
              console.log(styles);
            },
            renderHTML: () => {
              const html = renderHTML(parsed, ctx);
              this.ref.output.innerHTML = html;
              this.ref.parsed.textContent = JSON.stringify(parsed, null, 2);
              console.log("HTML!");
              console.log(html);
              console.log(parsed);
            },
          };
          ctx.renderStyles();
          ctx.renderHTML();
        }, 100);
        stateInputEl.addEventListener("input", () => {
          update();
        });
        update();
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkdownScreenPreview;
  }
}
