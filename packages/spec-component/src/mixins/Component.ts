import STYLES from "../caches/STYLE_CACHE";
import { ComponentSpec } from "../types/ComponentSpec";
import augmentCSS from "../utils/augmentCSS";
import convertCamelToKebabCase from "../utils/convertCamelToKebabCase";
import getPropValue from "../utils/getPropValue";

class SpecComponent extends HTMLElement {}

const Component = <Props, State, Store, T extends CustomElementConstructor>(
  spec: ComponentSpec<Props, State, Store>,
  Base: T = SpecComponent as T
) => {
  const tag = spec.tag;
  const props = spec.props;
  const cache = spec.cache;
  const reduce = spec.reducer;
  const updateEvent = spec.updateEvent || "update";

  const propToAttrMap = {} as Record<keyof Props, string>;
  if (props) {
    Object.keys(props).forEach((propName) => {
      const attrName = convertCamelToKebabCase(propName);
      propToAttrMap[propName as keyof Props] = attrName;
    });
  }

  const cls = class CustomElement extends Base {
    shadowDOM = true;

    #initialized = false;

    #store?: Store;

    get state() {
      return this.reduce(cache?.()) || ({} as State);
    }

    get props() {
      return Object.keys(props || {}).reduce((p, c) => {
        const propName = c as keyof Props;
        p[propName] = this[c as keyof this] as any;
        return p;
      }, {} as Props);
    }

    /**
     * Returns the default lowercase tag for this component.
     */
    static get tag() {
      return tag;
    }

    /**
     * A map of each camelCased property name to its corresponding kebab-cased attribute name
     */
    static get attrs() {
      return propToAttrMap;
    }

    /**
     * Attributes that will cause attributeChangedCallback to be called whenever they are added, removed, or changed.
     */
    static get observedAttributes() {
      return Object.values(this.attrs);
    }

    /**
     * The css to adopt for this component.
     */
    get css() {
      return this.getCSS(spec);
    }

    /**
     * The innerHTML for this component.
     */
    get html() {
      return this.getHTML(spec, { props: this.props, state: this.state });
    }

    /**
     * The event that will cause the component to potentially re-render if its state has changed.
     */
    get updateEvent() {
      return updateEvent;
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

    constructor(...args: any[]) {
      super();
      if (this.shadowDOM) {
        const shadowRoot = this.attachShadow({
          mode: "open",
          delegatesFocus: true,
        });
        shadowRoot.innerHTML = this.html;
        this.css.forEach((c) => {
          STYLES.adoptStyle(shadowRoot, c);
        });
      } else {
        this.innerHTML = this.html;
        const tagName = this.tagName.toLowerCase();
        this.css.forEach((c) => {
          STYLES.adoptStyle(this.ownerDocument, augmentCSS(c, tagName));
        });
      }
    }

    getCSS<Props, State, Store>(spec: ComponentSpec<Props, State, Store>) {
      return typeof spec.css === "string" ? [spec.css] : spec.css || [];
    }

    getHTML<Props, State, Store>(
      spec: ComponentSpec<Props, State, Store>,
      context: { props: Props; state: State }
    ) {
      return typeof spec.html === "string"
        ? spec.html
        : spec.html?.(context) || "";
    }

    reduce(store?: Store): State | undefined {
      return reduce?.(store);
    }

    /**
     * The callback that is invoked each time one of the element's attributes is added, removed, or changed.
     * Which attributes to notice change for is specified in a static get observedAttributes method
     */
    attributeChangedCallback(
      name: string,
      oldValue: string,
      newValue: string
    ): void {
      if (newValue !== oldValue) {
        this.onAttributeChanged(name, newValue);
      }
    }

    /**
     * Invoked each time one of the element's attributes is added, removed, or changed.
     * Which attributes to notice change for is specified in a static get observedAttributes method
     */
    onAttributeChanged(name: string, newValue: string): void {}

    /**
     * The callback that is invoked each time the custom element is appended into a document-connected element.
     * (This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.)
     */
    connectedCallback(): void {
      if (!this.#initialized) {
        this.onInit();
        this.#initialized = true;
      }
      window.addEventListener(this.updateEvent, this.#handleUpdate);
      this.onConnected();
    }

    /**
     * Invoked each time the custom element is appended into a document-connected element.
     * (This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.)
     */
    onConnected(): void {}

    /**
     * The callback that is invoked each time the custom element is disconnected from the document's DOM.
     */
    disconnectedCallback(): void {
      window.removeEventListener(this.updateEvent, this.#handleUpdate);
      this.onDisconnected();
    }

    /**
     * Invoked each time the custom element is disconnected from the document's DOM.
     */
    onDisconnected(): void {}

    /**
     * Invoked the first time the custom element is connected.
     * (Is not called during subsequent updates.)
     */
    onInit() {}

    /**
     * Invoked each time the update event is detected.
     */
    onUpdate(newStore: Store): void {}

    #handleUpdate = (e: Event): void => {
      if (e instanceof CustomEvent) {
        const newStore = e.detail as Store;
        const oldState = this.reduce(this.#store);
        const newState = this.reduce(newStore);
        this.onUpdate(newStore);
        if (newState) {
          let rerender = false;
          Object.entries(newState).forEach(([k, v]) => {
            const key = k as keyof State;
            const oldValue = oldState?.[key];
            const newValue = v as any;
            if (oldValue !== newValue) {
              rerender = true;
            }
          });
          if (rerender) {
            this.render();
          }
        }
        this.#store = newStore;
      }
    };

    /**
     * Re-renders the component using the component's latest props and state
     */
    render() {
      this.disconnectedCallback();
      if (this.shadowRoot) {
        this.shadowRoot.innerHTML = this.html;
      } else {
        this.innerHTML = this.html;
      }
      this.connectedCallback();
    }

    /**
     * Dispatches a cancelable, composed, bubbling event.
     * Returns true if either event's cancelable attribute value is false
     * or its preventDefault() method was not invoked, and false otherwise.
     */
    emit<T>(eventName: string, detail?: T): boolean {
      return this.dispatchEvent(
        new CustomEvent(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail,
        })
      );
    }

    getElementByTag<T extends HTMLElement>(name: string): T | null {
      return this.self.querySelector<T>(name) || null;
    }

    getElementById<T extends HTMLElement>(name: string): T | null {
      return this.self.querySelector<T>(`#${name}`) || null;
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

    getSlotByName<T extends HTMLSlotElement>(name?: string): T | null {
      if (name) {
        return this.self.querySelector(`slot[name=${name}]`) || null;
      }
      return this.self.querySelector(`slot:not([name])`) || null;
    }
  };

  if (props) {
    Object.entries(props).forEach(([propName, v]) => {
      const attrName = propToAttrMap[propName as keyof Props];
      Object.defineProperty(cls.prototype, propName, {
        get(this: InstanceType<typeof cls>) {
          if (attrName) {
            const attrValue = this.getAttribute(attrName);
            return getPropValue(attrValue, v);
          } else {
            return null;
          }
        },
        set(this: InstanceType<typeof cls>, value) {
          if (attrName) {
            if (value === undefined) {
              this.removeAttribute(attrName);
            } else if (value === null) {
              this.removeAttribute(attrName);
            } else if (value === false) {
              this.removeAttribute(attrName);
            } else if (value === true) {
              this.setAttribute(attrName, "");
            } else if (typeof value === "number") {
              this.setAttribute(attrName, String(value));
            } else {
              this.setAttribute(attrName, String(value));
            }
          }
        },
      });
    });
  }

  return cls as {
    new (...params: any[]): InstanceType<typeof cls> & Props;
    readonly tag: string;
    readonly observedAttributes: string[];
    readonly attrs: Record<keyof Props, unknown>;
  } & T;
};

export default Component;
