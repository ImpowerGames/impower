import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { animationsComplete } from "../../utils/animationsComplete";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { lockBodyScrolling, unlockBodyScrolling } from "../../utils/scroll";
import css from "./drawer.css";
import html from "./drawer.html";

const styles = new CSSStyleSheet();

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const REMOVED_EVENT = "removed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap([]);

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["open", "dismissable"]);

/**
 * Drawers slide in from a container to expose additional options and information.
 */
export default class Drawer
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-drawer";

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
    return Drawer.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get styles() {
    styles.replaceSync(Drawer.augmentCss(css, DEFAULT_DEPENDENCIES));
    return [styles];
  }

  /**
   * Indicates whether or not the drawer is open. You can toggle this attribute to show and hide the drawer, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the drawer's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Drawer.attributes.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Drawer.attributes.open, value);
  }

  /**
   * Indicates whether or not the drawer can be dismissed by clicking the backdrop behind it.
   */
  get dismissable(): boolean {
    return this.getBooleanAttribute(Drawer.attributes.dismissable);
  }
  set dismissable(value) {
    this.setStringAttribute(Drawer.attributes.dismissable, value);
  }

  get dialog(): HTMLDialogElement {
    return this.root as HTMLDialogElement;
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Drawer.attributes.open) {
      if (newValue != null) {
        this.handleOpen(true);
      }
    }
  }

  protected override onConnected(): void {
    this.dialog.addEventListener("click", this.handleLightDismiss);
    this.dialog.addEventListener("close", this.handleEscapeClose);
  }

  protected override onParsed(): void {
    this.root.hidden = !this.open;
    if (this.open) {
      lockBodyScrolling(this);
    }
  }

  protected override onDisconnected(): void {
    unlockBodyScrolling(this);
    this.dialog.removeEventListener("click", this.handleLightDismiss);
    this.dialog.removeEventListener("close", this.handleEscapeClose);
    this.emit(REMOVED_EVENT);
  }

  protected handleLightDismiss = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el === this.dialog && this.dismissable) {
      this.close("dismiss");
    }
  };

  protected async handleOpen(modal: boolean): Promise<void> {
    this.root.hidden = false;
    this.root.inert = false;
    this.setAttribute("loaded", "");
    if (modal) {
      this.dialog.showModal();
      lockBodyScrolling(this);
    } else {
      this.dialog.show();
    }

    const focusTarget = this.root.querySelector<HTMLElement>("[focus]");

    if (focusTarget) {
      focusTarget.focus();
    } else {
      this.root.querySelector("button")?.focus();
    }

    this.emit(OPENING_EVENT);

    await animationsComplete(this.root);

    this.emit(OPENED_EVENT);
  }

  protected handleClose = async (
    returnValue?: string
  ): Promise<string | undefined> => {
    this.dialog.inert = true;
    this.open = false;
    this.emit(CLOSING_EVENT);

    await animationsComplete(this.root);

    this.dialog.close();

    this.emit(CLOSED_EVENT);
    return returnValue;
  };

  protected handleEscapeClose = async (
    e: Event
  ): Promise<string | undefined> => {
    return this.handleClose("escape");
  };

  protected handleClickClose = async (
    e: Event
  ): Promise<string | undefined> => {
    const button = e.currentTarget as HTMLButtonElement;
    const returnValue = button?.getAttribute?.("id") ?? "";
    return this.handleClose(returnValue);
  };

  /**
   * Closes the drawer element.
   *
   * The argument, if provided, provides a return value.
   */
  async close(returnValue?: string): Promise<string | undefined> {
    return this.handleClose(returnValue);
  }

  /**
   * Displays the drawer element.
   */
  async show(): Promise<void> {
    return this.handleOpen(false);
  }

  /**
   * Displays the drawer element and prevents the user from interacting with anything behind the element.
   */
  async showModal(): Promise<void> {
    return this.handleOpen(true);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-drawer": Drawer;
  }
  interface HTMLElementEventMap {
    closing: CustomEvent;
    closed: CustomEvent;
    opening: CustomEvent;
    opened: CustomEvent;
    removed: CustomEvent;
  }
}
