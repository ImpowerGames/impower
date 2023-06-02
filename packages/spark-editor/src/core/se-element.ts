import Styles from "../helpers/styles";
import coreCSS from "../styles/core/core.css";
import normalizeCSS from "../styles/normalize/normalize.css";

export default class SEElement extends HTMLElement {
  static useShadowDom = false;
  static useInlineStyles = false;

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
    tagName: string,
    dependencies?: Record<string, string>,
    useShadowDom = true,
    useInlineStyles = true
  ): Promise<CustomElementConstructor> {
    SEElement.useShadowDom = useShadowDom;
    SEElement.useInlineStyles = useInlineStyles;
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

  get styles(): string[] {
    return [];
  }

  get self(): ShadowRoot | HTMLElement {
    return this.shadowRoot || this;
  }

  get root(): HTMLElement {
    return this.self?.firstElementChild as HTMLElement;
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
    if (SEElement.useShadowDom) {
      const shadowRoot = this.attachShadow({
        mode: "open",
        delegatesFocus: true,
      });
      shadowRoot.innerHTML = this.html;
      Styles.adopt(shadowRoot, normalizeCSS, SEElement.useInlineStyles);
      Styles.adopt(shadowRoot, coreCSS, SEElement.useInlineStyles);
      this.styles.forEach((css) => {
        Styles.adopt(shadowRoot, css, SEElement.useInlineStyles);
      });
    } else {
      Styles.adopt(this.ownerDocument, normalizeCSS, SEElement.useInlineStyles);
      Styles.adopt(this.ownerDocument, coreCSS, SEElement.useInlineStyles);
      this.styles.forEach((css) => {
        Styles.adopt(this.ownerDocument, css, SEElement.useInlineStyles);
      });
    }
  }

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

  override focus(options?: FocusOptions | undefined): void {
    this.selfChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.focus(options);
      }
    });
    this.assignedChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.focus(options);
      }
    });
  }

  override blur(): void {
    this.selfChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.blur();
      }
    });
    this.assignedChildren?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.blur();
      }
    });
  }
}
