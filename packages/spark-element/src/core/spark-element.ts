import STYLES from "../caches/STYLE_CACHE";
import normalizeCSS from "../styles/normalize/normalize.css";
import { getUnitlessValue } from "../utils/getUnitlessValue";

export default class SparkElement extends HTMLElement {
  static useShadowDom = false;

  private static _tagName = "";
  static get tagName() {
    return this._tagName;
  }
  private static set tagName(value) {
    this._tagName = value;
  }

  private static _dependencies: Record<string, string> = {};
  static get dependencies(): Record<string, string> {
    return this._dependencies;
  }
  static set dependencies(value: Record<string, string>) {
    this._dependencies = value;
  }

  static async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    SparkElement.useShadowDom = useShadowDom;
    if (tagName) {
      this.tagName = tagName;
    }
    if (dependencies) {
      this.dependencies = { ...this.dependencies, ...dependencies };
    }
    customElements.define(this.tagName, this);
    return customElements.whenDefined(this.tagName);
  }

  get html(): string {
    return `<slot class="content-slot"></slot>`;
  }

  get css(): string {
    return ":host{ display: contents }";
  }

  private static _attributes: Record<string, string> = {};
  static get attributes() {
    return this._attributes;
  }

  get sharedStyles(): string[] {
    return [];
  }

  get self(): ShadowRoot | HTMLElement {
    return this.shadowRoot || this;
  }

  get root(): HTMLElement {
    return this.self.firstElementChild as HTMLElement;
  }

  get contentSlot(): HTMLSlotElement | null {
    return this.self.querySelector(`slot:not([name])`) || null;
  }

  get selfChildren(): Element[] {
    return Array.from(this.self.querySelectorAll("*"));
  }

  get assignedChildren(): Element[] {
    return (
      this.contentSlot?.assignedElements({
        flatten: true,
      }) || []
    );
  }

  constructor() {
    super();
    if (SparkElement.useShadowDom) {
      const shadowRoot = this.attachShadow({
        mode: "open",
        delegatesFocus: true,
      });
      shadowRoot.innerHTML = this.html;
      STYLES.adopt(shadowRoot, normalizeCSS);
      this.sharedStyles.forEach((css) => {
        STYLES.adopt(shadowRoot, css);
      });
      STYLES.adopt(shadowRoot, this.css);
    } else {
      STYLES.adopt(this.ownerDocument, normalizeCSS);
      this.sharedStyles.forEach((css) => {
        STYLES.adopt(this.ownerDocument, css);
      });
      STYLES.adopt(this.ownerDocument, this.css);
    }
  }

  /**
   * Replaces tags in html with tag aliases specified by `dependencies`.
   *
   * @param html - the original html.
   * @param tags - the tags to replace. (If not specified, this defaults to the keys of the `dependencies` property.)
   * @returns the augmented html.
   */
  static augmentHtml(
    html: string,
    defaultDependencies: Record<string, string>
  ): string {
    if (this.dependencies) {
      Object.entries(defaultDependencies).forEach(
        ([dependencyName, defaultTagName]) => {
          const newTagName = this.dependencies[dependencyName];
          if (newTagName && newTagName != defaultTagName) {
            html.replace(
              new RegExp(`<(${defaultTagName})`, "g"),
              `<${newTagName}`
            );
          }
        }
      );
    }
    return html;
  }

  getBooleanAttribute<T extends boolean>(name: string): T {
    const value = this.getAttribute(name);
    return (value != null) as T;
  }

  setBooleanAttribute<T extends boolean>(name: string, value: T): void {
    if (typeof value === "string") {
      if (value === "") {
        this.setAttribute(name, "");
      } else {
        this.removeAttribute(name);
      }
    } else if (value) {
      this.setAttribute(name, "");
    } else {
      this.removeAttribute(name);
    }
  }

  getStringAttribute<T extends string>(name: string): T | null {
    const value = this.getAttribute(name);
    return (value != null ? value : null) as T;
  }

  setStringAttribute<T extends string>(
    name: T,
    value: T | number | boolean | null
  ): void {
    if (typeof value === "boolean") {
      if (value) {
        this.setAttribute(name, "");
      } else {
        this.removeAttribute(name);
      }
    } else if (value != null) {
      this.setAttribute(name, `${value}`);
    } else {
      this.removeAttribute(name);
    }
  }

  getNumberAttribute(name: string, emptyValue = 0): number | null {
    const value = this.getAttribute(name);
    return value != null ? getUnitlessValue(value, emptyValue) : null;
  }

  setNumberAttribute(name: string, value: number | null): void | null {
    if (value != null) {
      this.setAttribute(name, String(value));
    } else {
      this.removeAttribute(name);
    }
  }

  getElementByTag<T extends HTMLElement>(name: string): T | null {
    return this.self.querySelector<T>(name) || null;
  }

  getElementByClass<T extends HTMLElement>(name: string): T | null {
    return this.self.querySelector<T>(`.${name}`) || null;
  }

  getElementByNameAttribute<T extends Element>(name: string): T | null {
    return this.self.querySelector<T>(`[name=${name}]`) || null;
  }

  getElementsByNameAttribute<T extends Element>(name: string): T[] {
    return Array.from(this.self.querySelectorAll<T>(`[name=${name}]`)) as T[];
  }

  protected attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    this.onAttributeChanged(name, oldValue, newValue);
  }

  /**
   * Invoked each time one of the element's attributes is added, removed, or changed.
   * Which attributes to notice change for is specified in a static get observedAttributes method
   */
  protected onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ) {}

  /**
   * Invoked each time the custom element is appended into a document-connected element.
   * (This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.)
   */
  protected connectedCallback(): void {
    this.onConnected();
    window.setTimeout(() => {
      this.parsedCallback();
    });
  }

  protected onConnected(): void {}

  protected parsedCallback(): void {
    this.onParsed();
  }

  protected onParsed(): void {}

  /**
   * Invoked each time the custom element is disconnected from the document's DOM.
   */
  protected disconnectedCallback(): void {
    this.onDisconnected();
  }

  protected onDisconnected(): void {}
}