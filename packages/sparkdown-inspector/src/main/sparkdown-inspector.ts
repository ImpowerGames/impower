import { Component } from "../../../spec-component/src/component";
import { throttle } from "../utils/throttle";
import spec from "./_sparkdown-inspector";

export default class SparkdownInspector extends Component(spec) {
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
        const { textDocument, data, openPaths } = message.params;
        this._textDocument = textDocument;
        this.refs.editor.innerHTML = this.getFormContent(data, openPaths);
      }
    }
  };

  getFormContent(data: any, currentlyOpenPaths: string[]): string {
    const openPaths: Set<string> = new Set(currentlyOpenPaths || []);

    const createInput = (key: string, value: any) => {
      const id = `field-${key}`;
      const labelName = key.split(".").pop();
      if (typeof value === "boolean") {
        const checked = value ? "checked" : "";
        return `
        <label class="input-group">
          <div class="property-label">
            <span class="child-property-name">${labelName}:</span>
          </div>
          <input type="checkbox" id="${id}" data-path="${key}" ${checked}>
        </label>
        `;
      } else if (typeof value === "number") {
        const integer = Math.trunc(value);
        const digits = integer.toString().length;
        const mag = Number("1" + "0".repeat(digits));
        const min = integer < 0 ? -mag : 0;
        const max = integer === 0 ? 1 : mag;
        const step = Number.isInteger(value) ? 1 : 0.01;
        return `
        <label class="input-group">
          <div class="property-label">
            <span class="child-property-name">${labelName}:</span>
          </div>
          <div class="value-group">
            <input type="range" class="slider" id="${id}" data-path="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
            <input type="number" class="slider-value" id="${id}-val" data-linked-to="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
          </div>
        </label>
      `;
      } else {
        return `
        <label class="input-group">
          <div class="property-label">
            <span class="child-property-name">${labelName}:</span>
          </div>
          <input type="text" class="input" id="${id}" data-path="${key}" value="${value}">
        </label>
        `;
      }
    };

    const renderNestedObject = (obj: any, path: string[] = []): string => {
      const keys = Object.keys(obj);
      return keys
        .map((key) => {
          const fullPath = [...path, key];
          const fullPathStr = fullPath.join(".");
          const value = obj[key];

          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            const isOpen = openPaths.has(fullPathStr) || path.length === 0;
            return `
            <details data-path="${fullPathStr}" class="collapsible" ${
              isOpen ? "open" : ""
            }>
              <summary><span class="parent-property-name">${key}</span></summary>
              <div class="group">
                ${renderNestedObject(value, fullPath)}
              </div>
            </details>
          `;
          } else {
            return createInput(fullPathStr, value);
          }
        })
        .join("\n");
    };

    const update = throttle((path: string, value: any) => {
      this.emit("jsonrpc", {
        method: "update",
        params: {
          textDocument: this._textDocument,
          path,
          value,
        },
      });
    }, 100);

    setTimeout(() => {
      // Detect when details are toggled open/closed
      this.root
        .querySelectorAll<HTMLDetailsElement>("details.collapsible[data-path]")
        .forEach((el) => {
          const summary = el.querySelector("summary") as HTMLElement;
          const path = el.getAttribute("data-path")!;

          if (!summary) return;

          summary.addEventListener("mousedown", (e) => {
            // prevent clicking summary from erroneously selecting previous element
            e.preventDefault();
          });

          summary.addEventListener("click", (e) => {
            const willOpen = !el.open;

            setTimeout(() => {
              el.open = willOpen;

              if (willOpen) {
                openPaths.add(path);
              } else {
                openPaths.delete(path);
              }

              this.emit("jsonrpc", {
                method: "state",
                params: {
                  textDocument: this._textDocument,
                  openPaths: Array.from(openPaths),
                },
              });
            }, 0);
          });
        });

      this.root
        .querySelectorAll<HTMLInputElement>(
          "input[type='range'], input[type='text'], input[type='checkbox']"
        )
        .forEach((input) => {
          const path = input.dataset["path"];
          if (!path) return;

          if (input.type === "range") {
            input.addEventListener("input", () => {
              const numberInput =
                input.parentElement?.querySelector<HTMLInputElement>(
                  `input[type="number"][data-linked-to="${input.id}"]`
                );
              if (numberInput) {
                numberInput.value = input.value;
              }
              update(path, Number(input.value));
            });
          }
          if (
            input.type === "number" &&
            input.classList.contains("slider-value")
          ) {
            input.addEventListener("input", () => {
              const slider =
                input.parentElement?.querySelector<HTMLInputElement>(
                  `input[type="range"]#${input.dataset["linkedTo"]}`
                );
              if (slider) {
                slider.value = input.value;
              }
              update(path, Number(input.value));
            });
          } else if (input.type === "checkbox") {
            input.addEventListener("change", () => {
              update(path, input.checked);
            });
          } else {
            input.addEventListener("input", () => {
              update(path, input.value);
            });
          }
        });
    }, 0);

    return renderNestedObject(data);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkdownInspector;
  }
}
