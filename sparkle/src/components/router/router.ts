import SparkleElement from "../../core/sparkle-element";
import css from "./router.css";
import html from "./router.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Routers are used to lazy-load templates when their value matches an observed value.
 *
 * This element loads any child template whose value attribute matches an observed value.
 * All other children are unloaded.
 */
export default class Router extends SparkleElement {
  static override async define(
    tag = "s-router",
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "observe"];
  }

  /**
   * The id of the sibling element to observe.
   *
   * If not specified, this element will observe any sibling with a value attribute.
   */
  get observe(): string | null {
    return this.getStringAttribute("observe");
  }

  /**
   * Allow panels to be swiped.
   *
   * Set to `touch` to limit swipe detection to touch devices.
   * Set to `mouse` to limit swipe detection to mouse devices.
   * Set to `pointer` to support swipe detection for any device.
   *
   * If not provided a value, defaults to `pointer`.
   */
  get transition(): "pointer" | "touch" | "mouse" | null {
    return this.getStringAttribute("observe");
  }

  /**
   * Allow panels to be swiped.
   *
   * Set to `touch` to limit swipe detection to touch devices.
   * Set to `mouse` to limit swipe detection to mouse devices.
   * Set to `pointer` to support swipe detection for any device.
   *
   * If not provided a value, defaults to `pointer`.
   */
  get swipeable(): "pointer" | "touch" | "mouse" | null {
    return this.getStringAttribute("observe");
  }

  get observedEl(): HTMLElement | null {
    const observedElId = this.observe;
    const siblings = this.parentElement?.childNodes;
    let found = null;
    if (observedElId) {
      siblings?.forEach((sibling) => {
        const el = sibling as HTMLElement;
        if (el?.getAttribute?.("id") === observedElId) {
          found = el;
        }
      });
    }
    if (found) {
      return found;
    }
    siblings?.forEach((sibling) => {
      const el = sibling as HTMLElement;
      if (el?.getAttribute?.("value") != null) {
        found = el;
      }
    });
    return found;
  }

  get contentEl(): HTMLElement | null {
    return this.getElementByClass("content");
  }

  get templatesSlot(): HTMLSlotElement | null {
    return this.getElementByClass("templates");
  }

  protected _templates: HTMLTemplateElement[] = [];

  protected _valueObserver?: MutationObserver;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "observe") {
      this.observeValue();
    }
  }

  protected override onConnected(): void {
    this.templatesSlot?.addEventListener("slotchange", this.handleSlotChange);
    this._valueObserver = new MutationObserver(this.handleValueMutation);
  }

  protected override onParsed(): void {
    this.observeValue();
    this.loadTemplates();
  }

  protected override onDisconnected(): void {
    this.templatesSlot?.removeEventListener(
      "slotchange",
      this.handleSlotChange
    );
    this._valueObserver?.disconnect();
  }

  loadTemplates() {
    const observedEl = this.observedEl;
    const contentEl = this.contentEl;
    // Unload all existing content
    contentEl?.replaceChildren();
    this._templates.forEach((el) => {
      if (observedEl && contentEl) {
        const observedValue = observedEl.getAttribute("value");
        const value = el.getAttribute("value");
        if (observedValue === value) {
          // Load template content
          contentEl.appendChild(el.content.cloneNode(true));
        }
      }
    });
  }

  observeValue() {
    if (this._valueObserver) {
      this._valueObserver.disconnect();
    }
    const observedEl = this.observedEl;
    if (observedEl) {
      if (this._valueObserver) {
        this._valueObserver.observe(observedEl, {
          attributes: true,
          attributeFilter: ["value"],
        });
      }
    }
  }

  protected handleSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this._templates = slot
      ?.assignedElements?.()
      .filter(
        (el) => el.tagName.toLowerCase() === "template"
      ) as HTMLTemplateElement[];
  };

  protected handleValueMutation = (mutations: MutationRecord[]) => {
    this.loadTemplates();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-router": Router;
  }
}
