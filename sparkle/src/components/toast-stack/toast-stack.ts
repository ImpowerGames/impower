import SparkleElement from "../../core/sparkle-element";
import Toast from "../toast/toast";
import css from "./toast-stack.css";
import html from "./toast-stack.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_TOAST_STACK_DEPENDENCIES = {
  "s-toast": "s-toast",
};

/**
 * Toast Stacks are used to display alert notifications in a stack.
 */
export default class ToastStack extends SparkleElement {
  static override dependencies = DEFAULT_TOAST_STACK_DEPENDENCIES;

  static override async define(
    tag = "s-toast-stack",
    dependencies = DEFAULT_TOAST_STACK_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return ToastStack.augment(html, DEFAULT_TOAST_STACK_DEPENDENCIES);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "alert"];
  }

  /**
   * The alert to display inside the toast stack.
   *
   * To specify an icon, follow the message with a semi-colon and the icon name.
   * e.g. `Someone liked this!;heart`
   *
   */
  get alert(): string | null {
    return this.getStringAttribute("alert");
  }
  set alert(value: string | null) {
    this.setStringAttribute("alert", value);
  }

  get contentEl(): HTMLElement | null {
    return this.getElementByClass("content");
  }

  get templatesSlot(): HTMLSlotElement | null {
    return this.getElementByClass("templates");
  }

  protected _templates: HTMLTemplateElement[] = [];

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "alert") {
      if (newValue != null) {
        const [message, icon, type] = newValue.split(";");
        if (message) {
          this.createAlert(message, icon, type);
        }
      }
    }
  }

  protected override connectedCallback(): void {
    super.connectedCallback();
    this.templatesSlot?.addEventListener("slotchange", this.handleSlotChange);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.templatesSlot?.removeEventListener(
      "slotchange",
      this.handleSlotChange
    );
  }

  protected handleSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this._templates = slot
      ?.assignedElements?.()
      .filter(
        (el) => el.tagName.toLowerCase() === "template"
      ) as HTMLTemplateElement[];
  };

  getTemplate(type?: string): HTMLTemplateElement | null {
    if (!type) {
      return this._templates[0] || null;
    }
    return (
      this._templates.find((el) => el.getAttribute("type") === type) ||
      this._templates[0] ||
      null
    );
  }

  async createAlert(
    message: string,
    icon?: string,
    type?: string
  ): Promise<void> {
    const contentEl = this.contentEl;
    if (!contentEl) {
      return;
    }
    const template = this.getTemplate(type);
    const templateContent =
      template?.content?.cloneNode?.(true) ||
      this.getElementByTag<Toast>(ToastStack.dependencies["s-toast"]);
    if (templateContent) {
      contentEl.appendChild(templateContent);
    }
    const toastList = contentEl.querySelectorAll<Toast>(
      ToastStack.dependencies["s-toast"]
    );
    const toast = toastList?.item(toastList.length - 1);
    if (!toast) {
      return;
    }
    if (icon != null) {
      toast.setAttribute("icon", icon);
    } else {
      toast.removeAttribute("icon");
    }
    if (message != null) {
      toast.setAttribute("message", message);
    } else {
      toast.removeAttribute("message");
    }
    return toast.alert?.(contentEl);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-toast-stack": ToastStack;
  }
}
