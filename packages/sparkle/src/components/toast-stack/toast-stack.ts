import SparkleElement from "../../core/sparkle-element";
import Queue from "../../helpers/queue";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import Toast from "../toast/toast";
import css from "./toast-stack.css";
import html from "./toast-stack.html";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-toast"]);

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["alert"]);

/**
 * Toast Stacks are used to display alert notifications in a stack.
 */
export default class ToastStack
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-toast-stack";

  static override dependencies = { ...DEFAULT_DEPENDENCIES };

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get html() {
    return ToastStack.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get styles() {
    return [ToastStack.augmentCss(css, DEFAULT_DEPENDENCIES)];
  }

  /**
   * The alert to display inside the toast stack.
   *
   * Alerts are of the format `<label>;<action>;<timeout>`
   * (e.g. `Photo deleted.;Undo;5000`)
   *
   */
  get alert(): string | null {
    return this.getStringAttribute(ToastStack.attributes.alert);
  }
  set alert(value: string | null) {
    this.setStringAttribute(ToastStack.attributes.alert, value);
  }

  protected _templates: HTMLTemplateElement[] = [];

  protected _queue = new Queue();

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === ToastStack.attributes.alert) {
      if (newValue != null) {
        const [message, action, timeout, type] = newValue.split(";");
        if (message) {
          this.queueAlert(message, action, timeout, type);
        }
      }
    }
  }

  protected override onContentAssigned(children: Element[]): void {
    this._templates = children.filter(
      (el) => el.tagName.toLowerCase() === "template"
    ) as HTMLTemplateElement[];
  }

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

  async showAlert(
    message: string,
    action?: string,
    timeout?: string,
    type?: string
  ): Promise<void> {
    const template = this.getTemplate(type);
    const templateContent =
      template?.content?.cloneNode?.(true) ||
      this.getElementByTag<Toast>(ToastStack.dependencies.toast) ||
      new Toast();
    const toast = this.root.appendChild(templateContent) as Toast;
    if (!toast) {
      return;
    }
    if (message != null) {
      toast.setAttribute("message", message);
    } else {
      toast.removeAttribute("message");
    }
    if (action != null) {
      toast.setAttribute("action", action);
    } else {
      toast.removeAttribute("action");
    }
    if (timeout != null) {
      toast.setAttribute("timeout", timeout);
    } else {
      toast.removeAttribute("timeout");
    }
    await toast.alert?.(this.root);
  }

  async queueAlert(
    message: string,
    action?: string,
    timeout?: string,
    type?: string
  ): Promise<void> {
    return this._queue.enqueue(() =>
      this.showAlert(message, action, timeout, type)
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-toast-stack": ToastStack;
  }
}
