import {
  createElement,
  diffAndPatch,
  getComponents,
  parseSparkle,
  RenderContext,
  renderCssVDOM,
  renderHtmlVDOM,
  VNode,
} from "../../../sparkle-screen-renderer/src";
import { Component } from "../../../spec-component/src/component";
import { throttle } from "../utils/throttle";
import spec from "./_sparkdown-screen-preview";

export default class SparkdownScreenPreview extends Component(spec) {
  _textDocument?: { uri: string };

  _lastHtmlVDOM?: VNode;

  _lastCssVDOM?: VNode;

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
        const parsed = parseSparkle(input);
        const stateInputEl = this.ref.state as HTMLInputElement;
        const update = throttle(() => {
          const ctx: RenderContext = {
            parsed,
            components: getComponents(parsed),
            state: JSON.parse(stateInputEl.value || "{}"),
            renderStyles: () => {
              const container = this.ref.css;
              const newVDOM = renderCssVDOM(parsed, ctx);
              if (!this._lastCssVDOM) {
                container.innerHTML = "";
                container.appendChild(createElement(newVDOM));
              } else {
                diffAndPatch(container, this._lastCssVDOM, newVDOM);
              }
              this._lastCssVDOM = newVDOM;
              console.log("STYLES!");
              console.log(newVDOM);
            },
            renderHTML: () => {
              const container = this.ref.html;
              const newVDOM = renderHtmlVDOM(parsed, ctx);
              if (!this._lastHtmlVDOM) {
                container.innerHTML = "";
                container.appendChild(createElement(newVDOM));
              } else {
                diffAndPatch(container, this._lastHtmlVDOM, newVDOM);
              }
              this._lastHtmlVDOM = newVDOM;
              this.ref.parsed.textContent = JSON.stringify(parsed, null, 2);
              console.log("HTML!");
              console.log(newVDOM);
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
