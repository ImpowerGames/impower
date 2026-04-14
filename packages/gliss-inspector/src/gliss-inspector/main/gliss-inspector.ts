import { Component } from "../../../../spec-component/src/component";
import { Gliss, type GlissConfig, type GlissValues } from "../../gliss/gliss";
import spec from "./_gliss-inspector";

export interface GlissChangeEventDetail {
  key: string;
  value: any;
  values: GlissValues;
}

export default class GlissInspector extends Component(spec) {
  editor: Gliss;

  constructor() {
    super();
    this.editor = new Gliss(this, {
      onChange: this.onChange,
      onInteractStart: this.onInteractStart,
      onInteractEnd: this.onInteractEnd,
      onTap: this.onTap,
    });
  }

  onChange = (key: string, value: any, values: GlissValues) => {
    this.dispatchEvent(
      new CustomEvent<GlissChangeEventDetail>("gliss-changed", {
        detail: { key, value, values },
        bubbles: true,
        composed: true,
      }),
    );
  };

  onInteractStart = () => {
    this.dispatchEvent(
      new CustomEvent("gliss-interacting", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  onInteractEnd = () => {
    this.dispatchEvent(
      new CustomEvent("gliss-interacted", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  onTap = () => {
    this.dispatchEvent(
      new CustomEvent("gliss-tapped", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  public setEnabled(enabled: boolean): void {
    this.editor.setEnabled(enabled);
  }

  public loadConfig(config: GlissConfig, values: GlissValues): void {
    this.editor.loadConfig(config, values);
  }

  public renderMenu(animated: boolean = false): void {
    this.editor.renderMenu(animated);
  }

  public toggleMenu(): void {
    this.editor.toggleMenu();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "gliss-inspector": GlissInspector;
  }
}
