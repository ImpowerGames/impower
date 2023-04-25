import SparkleElement from "../../core/sparkle-element";
import { dispatchActivationClick, isActivationClick } from "../../utils/events";
import { pointerPress, shouldShowStrongFocus } from "../../utils/focus";
import { isServer } from "../../utils/isServer";
import Ripple from "../ripple/ripple";
import css from "./button.css";
import html from "./button.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button extends SparkleElement {
  static async define(tag = "s-button"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return this.href
      ? html.replace("<button ", "<a ").replace("</button>", "</a>")
      : html;
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "aria-label",
      "aria-expanded",
      "aria-haspopup",
      "href",
      "target",
      "disabled",
      "loading",
      "variant",
      "size",
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
   * Whether or not the button is disabled.
   */
  get disabled(): boolean {
    return this.getBooleanAttribute("disabled");
  }

  /**
   * Draws the button in a loading state.
   */
  get loading(): boolean {
    return this.getBooleanAttribute("loading");
  }

  /**
   * Determines the overall look of the button.
   */
  get variant(): "filled" | "tonal" | "outlined" | "text" | null {
    return this.getStringAttribute("variant");
  }

  /**
   * The size of this button.
   */
  get size(): "sm" | "md" | "lg" | null {
    return this.getStringAttribute("size");
  }

  constructor() {
    super({
      mode: "open",
      delegatesFocus: true,
    });
    if (!isServer()) {
      this.addEventListener("click", this.handleActivationClick);
    }
  }

  protected override connectedCallback(): void {
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("focus", this.handleFocus);
    this.root.addEventListener("blur", this.handleBlur);
    this.getElementByPart("label")?.addEventListener(
      "slotchange",
      this.handleLabelSlotChange
    );
    this.getSlotByName("prefix")?.addEventListener(
      "slotchange",
      this.handlePrefixSlotChange
    );
    this.getSlotByName("suffix")?.addEventListener(
      "slotchange",
      this.handleSuffixSlotChange
    );
    const ripple = this.getElementByTag<Ripple>("s-ripple");
    if (ripple) {
      ripple.bind?.(this.root);
    }
  }

  protected override disconnectedCallback(): void {
    this.root.removeEventListener("pointerdown", this.handlePointerDown);
    this.root.removeEventListener("focus", this.handleFocus);
    this.root.removeEventListener("blur", this.handleBlur);
    this.getElementByPart("label")?.removeEventListener(
      "slotchange",
      this.handleLabelSlotChange
    );
    this.getSlotByName("prefix")?.removeEventListener(
      "slotchange",
      this.handlePrefixSlotChange
    );
    this.getSlotByName("suffix")?.removeEventListener(
      "slotchange",
      this.handleSuffixSlotChange
    );
    const ripple = this.getElementByTag<Ripple>("s-ripple");
    if (ripple) {
      ripple.unbind?.(this.root);
    }
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "aria-label") {
      this.updateRootAttribute("aria-label", newValue);
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
    if (name === "disabled") {
      const ripple = this.getElementByTag<Ripple>("s-ripple");
      if (ripple) {
        if (newValue != null) {
          ripple.setAttribute("disabled", "");
        } else {
          ripple.removeAttribute("disabled");
        }
      }
    }
  }

  private readonly handleActivationClick = (event: MouseEvent) => {
    if (!isActivationClick(event)) {
      return;
    }
    this.focus();
    dispatchActivationClick(this.root);
  };

  override focus() {
    this.root.focus();
  }

  override blur() {
    this.root.blur();
  }

  protected showFocusRing = (visible: boolean) => {
    this.updateRootClass("focused", visible);
  };

  protected handlePointerDown = (e: PointerEvent) => {
    pointerPress();
    this.showFocusRing(shouldShowStrongFocus());
  };

  protected handleFocus = () => {
    this.showFocusRing(shouldShowStrongFocus());
  };

  protected handleBlur = () => {
    this.showFocusRing(false);
  };

  protected handleLabelSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const nodes = slot?.assignedNodes?.();
    const hasLabel = nodes.length > 0;
    nodes.forEach((node) => {
      if (node.nodeName.toLowerCase() === "s-badge") {
        const el = node as HTMLElement;
        el.setAttribute("float", this.getAttribute("rtl") ? "left" : "right");
      }
    });
    this.updateRootClass("has-label", hasLabel);
  };

  protected handlePrefixSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const nodes = slot?.assignedNodes?.();
    const hasPrefix = nodes.length > 0;
    this.updateRootClass("has-prefix", hasPrefix);
  };

  protected handleSuffixSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const nodes = slot?.assignedNodes?.();
    const hasSuffix = nodes.length > 0;
    this.updateRootClass("has-suffix", hasSuffix);
  };
}
