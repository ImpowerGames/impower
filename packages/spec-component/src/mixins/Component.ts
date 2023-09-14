import STYLES from "../caches/STYLE_CACHE";
import Context from "../classes/Context";
import { ComponentSpec } from "../types/ComponentSpec";
import augmentCSS from "../utils/augmentCSS";
import convertCamelToKebabCase from "../utils/convertCamelToKebabCase";
import getPropValue from "../utils/getPropValue";

const reactive = <T extends (...args: any[]) => void>(
  object: any,
  callback: T
) => {
  if (object == null || typeof object !== "object") {
    return object;
  }
  for (const property in object) {
    object[property] = reactive(object[property], callback);
  }
  return new Proxy(object, {
    get: (target, property) => {
      return target[property];
    },
    set: (target, property, value) => {
      if (target[property] !== value) {
        target[property] = reactive(value, callback);
        callback();
        return true;
      }
      return false;
    },
  });
};

class SpecComponent extends HTMLElement {}

const Component = <
  Props = Record<string, unknown>,
  State = Record<string, unknown>,
  Store = Record<string, unknown>,
  T extends CustomElementConstructor = CustomElementConstructor
>(
  spec: ComponentSpec<Props, State, Store>,
  Base: T = SpecComponent as T
) => {
  const tag = spec.tag;
  const context = spec.context;
  const state = spec.state;
  const props = spec.props;
  const css = spec.css;
  const html = spec.html;
  const shadowDOM = spec.shadowDOM;

  const propToAttrMap = {} as Record<keyof Props, string>;
  if (props) {
    Object.keys(props).forEach((propName) => {
      const attrName = convertCamelToKebabCase(propName);
      propToAttrMap[propName as keyof Props] = attrName;
    });
  }

  const cls = class CustomElement extends Base {
    shadowDOM = shadowDOM;

    #initialized = false;

    #html?: string;

    #store?: Store = this.context?.get();

    get context(): Context<Store> {
      return context as Context<Store>;
    }

    #state: State = reactive(
      this.reduce(this.context?.get()),
      this.render.bind(this)
    );
    get state(): State {
      return this.#state;
    }

    #props: Props = Object.keys(CustomElement.attrs).reduce((obj, key) => {
      const propName = key as keyof this;
      Object.defineProperty(obj, propName, {
        get: () => {
          return this[propName];
        },
        set: (value) => {
          this[propName] = value;
        },
      });
      return obj;
    }, {} as Props);
    get props() {
      return this.#props;
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
      return css;
    }

    /**
     * The innerHTML for this component.
     */
    get html() {
      return html({
        props: this.props,
        state: this.state,
        store: this.context?.get(),
      });
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
      const innerHTML = this.html;
      this.#html = innerHTML;
      if (this.shadowDOM) {
        const shadowRoot = this.attachShadow({
          mode: "open",
          delegatesFocus: true,
        });
        shadowRoot.innerHTML = innerHTML;
        this.css.forEach((c) => {
          STYLES.adoptStyle(shadowRoot, c);
        });
      } else {
        this.innerHTML = innerHTML;
        const tagName = this.tagName.toLowerCase();
        this.css.forEach((c) => {
          STYLES.adoptStyle(this.ownerDocument, augmentCSS(c, tagName));
        });
      }
    }

    reduce(store?: Store): State {
      return state(store);
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
        this.onUpdate();
        this.#initialized = true;
      }
      if (this.context) {
        this.context.root.addEventListener(
          this.context.event,
          this.#handleUpdate
        );
      }
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
      if (this.context) {
        this.context.root.removeEventListener(
          this.context.event,
          this.#handleUpdate
        );
      }
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
     * Invoked when the component is first connected or the update event is detected.
     */
    onUpdate(): void {}

    /**
     * Invoked when the component is rendered.
     */
    onRender(): void {}

    #handleUpdate = (e: Event): void => {
      if (e instanceof CustomEvent) {
        const newStore = this.context?.get();
        if (newStore) {
          const oldState = this.reduce(this.#store);
          const newState = this.reduce(newStore);
          this.#state = reactive(newState, this.render.bind(this));
          this.#store = newStore;
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
          this.onUpdate();
        }
      }
    };

    /**
     * Re-renders the component using the component's latest props and state
     */
    render() {
      const innerHTML = this.html;
      if (innerHTML !== this.#html) {
        this.#html = innerHTML;
        this.disconnectedCallback();
        if (this.shadowRoot) {
          this.shadowRoot.innerHTML = innerHTML;
        } else {
          this.innerHTML = innerHTML;
        }
        this.connectedCallback();
        this.onRender();
      }
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
