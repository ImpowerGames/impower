import SparkleElement from "../../core/sparkle-element";
import { getCssSize } from "../../utils/getCssSize";
import type ProgressCircle from "../progress-circle/progress-circle";
import type Ripple from "../ripple/ripple";
import css from "./button.css";
import html from "./button.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_BUTTON_DEPENDENCIES = {
  "s-badge": "s-badge",
  "s-progress-circle": "s-progress-circle",
  "s-ripple": "s-ripple",
  "s-icon": "s-icon",
};

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button extends SparkleElement {
  static override dependencies = DEFAULT_BUTTON_DEPENDENCIES;

  static override async define(
    tag = "s-button",
    dependencies = DEFAULT_BUTTON_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Button.augment(
      this.href
        ? html.replace("<button ", "<a ").replace("</button>", "</a>")
        : html,
      DEFAULT_BUTTON_DEPENDENCIES
    );
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "aria-expanded",
      "aria-haspopup",
      "href",
      "target",
      "disabled",
      "variant",
      "icon",
    ];
  }

  /**
   * The URL that the link button points to.
   */
  get href(): string | null {
    return this.getStringAttribute("href");
  }

  /**
   * Where to display the linked `href` URL for a link button. Common options
   * include `_blank` to open in a new tab.
   */
  get target(): string | null {
    return this.getStringAttribute("target");
  }

  /**
   * Determines the overall look of the button.
   */
  get variant(): "filled" | "tonal" | "outlined" | "text" | null {
    return this.getStringAttribute("variant");
  }

  /**
   * The size of the button.
   *
   * Default is `md`.
   */
  get size(): "xs" | "sm" | "md" | "lg" | null {
    return this.getStringAttribute("size");
  }

  /**
   * The spacing between the icon and the label
   */
  get spacing(): string | null {
    return this.getStringAttribute("spacing");
  }

  /**
   * The icon to display next to the label.
   */
  get icon(): string | null {
    return this.getStringAttribute("icon");
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  get labelSlot(): HTMLSlotElement | null {
    return this.getElementByClass("label");
  }

  get progressCircle(): ProgressCircle | null {
    return this.getElementByTag<ProgressCircle>(
      Button.dependencies["s-progress-circle"]
    );
  }

  get ripple(): Ripple | null {
    return this.getElementByTag<Ripple>(Button.dependencies["s-ripple"]);
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "disabled" || name === "loading") {
      if (newValue != null) {
        this.ripple?.setAttribute("disabled", "");
      } else {
        this.ripple?.removeAttribute("disabled");
      }
    }
    if (name === "aria-haspopup") {
      this.updateRootAttribute("aria-haspopup", newValue);
    }
    if (name === "aria-expanded") {
      this.updateRootAttribute("aria-expanded", newValue);
    }
    if (name === "href") {
      this.updateRootAttribute("href", newValue);
    }
    if (name === "target") {
      this.updateRootAttribute("target", newValue);
    }
    if (name === "icon") {
      const iconEl = this.iconEl;
      if (iconEl) {
        if (newValue != null) {
          iconEl.setAttribute("icon", newValue);
        } else {
          iconEl.removeAttribute("icon");
        }
      }
    }
    if (name === "spacing") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
  }

  protected override connectedCallback(): void {
    super.connectedCallback();
    this.ripple?.bind?.(this.root);
    this.labelSlot?.addEventListener("slotchange", this.handleLabelSlotChange);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ripple?.unbind?.(this.root);
    this.labelSlot?.removeEventListener(
      "slotchange",
      this.handleLabelSlotChange
    );
  }

  protected handleLabelSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const nodes = slot?.assignedNodes?.();
    nodes.forEach((node) => {
      if (node.nodeName.toLowerCase() === Button.dependencies["s-badge"]) {
        const el = node as HTMLElement;
        el.setAttribute("float", this.getAttribute("rtl") ? "left" : "right");
      }
    });
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-button": Button;
  }
}
