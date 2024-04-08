import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import Queue from "../../helpers/queue";
import Toast from "../toast/toast";
import spec from "./_toast-stack";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["alert"]),
};

/**
 * Toast Stacks are used to display alert notifications in a stack.
 */
export default class ToastStack
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
      state: this.state,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * The alert to display inside the toast stack.
   *
   * Alerts are of the format `<label>;<action>;<timeout>`
   * (e.g. `Photo deleted.;Undo;5000`)
   *
   */
  get alert(): string | null {
    return this.getStringAttribute(ToastStack.attrs.alert);
  }
  set alert(value: string | null) {
    this.setStringAttribute(ToastStack.attrs.alert, value);
  }

  protected _templates: HTMLTemplateElement[] = [];

  protected _queue = new Queue();

  override onAttributeChanged(name: string, newValue: string) {
    if (name === ToastStack.attrs.alert) {
      if (newValue != null) {
        const [message, action, timeout, type] = newValue.split(";");
        if (message) {
          this.queueAlert(message, action, timeout, type);
        }
      }
    }
  }

  protected override onContentAssigned(children: Element[]) {
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
      this.self.querySelector(this.selectors.toast) ||
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
