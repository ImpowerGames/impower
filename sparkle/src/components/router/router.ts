import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./router.css";
import html from "./router.html";

const styles = new CSSStyleSheet();

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["observe", "swipeable"]);

/**
 * Routers are used to lazy-load templates when their value matches an observed value.
 *
 * This element loads any child template whose value attribute matches an observed value.
 * All other children are unloaded.
 */
export default class Router
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-router";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }

  override get styles() {
    styles.replaceSync(Router.augmentCss(css));
    return [styles];
  }

  /**
   * The id of the sibling element to observe.
   *
   * If not specified, this element will observe any sibling with a value attribute.
   */
  get observe(): string | null {
    return this.getStringAttribute(Router.attributes.observe);
  }
  set observe(value) {
    this.setStringAttribute(Router.attributes.observe, value);
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
    return this.getStringAttribute(Router.attributes.swipeable);
  }
  set swipeable(value) {
    this.setStringAttribute(Router.attributes.swipeable, value);
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

  get templatesSlot(): HTMLSlotElement | null {
    return this.getElementByClass("templates-slot");
  }
  protected _templates: HTMLTemplateElement[] = [];

  protected _valueObserver?: MutationObserver;

  protected _loadedValue: string | null = null;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Router.attributes.observe) {
      this.observeValue();
    }
  }

  protected override onConnected(): void {
    this._valueObserver = new MutationObserver(this.handleValueMutation);
  }

  protected override onParsed(): void {
    this.observeValue();
    this.loadTemplates(this.observedEl?.getAttribute("value") ?? null);
  }

  protected override onDisconnected(): void {
    this._valueObserver?.disconnect();
  }

  protected override onContentAssigned(children: Element[]): void {
    this._templates = children.filter(
      (el) => el.tagName.toLowerCase() === "template"
    ) as HTMLTemplateElement[];
  }

  loadTemplates(newValue: string | null): void {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      this._templates.forEach((el) => {
        const value = el.getAttribute("value");
        if (newValue === value) {
          // Load template content
          const templateContent = el.content.cloneNode(true);
          this.setAssignedToSlot(templateContent);
          if (templateContent instanceof HTMLElement) {
            if (templateContent.getAttribute("role") == null) {
              templateContent.setAttribute("role", `tabpanel`);
            }
            if (templateContent.getAttribute("tabindex") == null) {
              templateContent.setAttribute("tabindex", "0");
            }
            if (value) {
              if (
                templateContent.getAttribute(Router.attributes.ariaLabel) ==
                null
              ) {
                templateContent.setAttribute(
                  Router.attributes.ariaLabel,
                  value
                );
              }
            }
          }
        }
      });
    }
  }

  observeValue(): void {
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

  protected handleValueMutation = (mutations: MutationRecord[]): void => {
    const mutation = mutations?.[0];
    const observedEl = mutation?.target as HTMLElement;
    const attributeName = mutation?.attributeName;
    if (attributeName) {
      const newValue = observedEl.getAttribute(attributeName);
      this.loadTemplates(newValue);
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-router": Router;
  }
}
