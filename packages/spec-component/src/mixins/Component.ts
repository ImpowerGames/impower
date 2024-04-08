import STYLES from "../caches/STYLE_CACHE";
import { ComponentSpec } from "../types/ComponentSpec";
import { IStore } from "../types/IStore";
import { RefMap } from "../types/RefMap";
import augmentCSS from "../utils/augmentCSS";
import convertCamelToKebabCase from "../utils/convertCamelToKebabCase";
import emit from "../utils/emit";
import getPropValue from "../utils/getPropValue";
import reactive from "../utils/reactive";

const Component = <
  Props extends Record<string, unknown>,
  State extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>,
  T extends CustomElementConstructor
>(
  spec: ComponentSpec<Props, State, Stores, Context, Graphics, Selectors>,
  Base: T = HTMLElement as T
) => {
  const propToAttrMap = {} as Record<keyof Props, string>;
  if (spec.props) {
    Object.keys(spec.props).forEach((propName) => {
      const attrName = convertCamelToKebabCase(propName);
      propToAttrMap[propName as keyof Props] = attrName;
    });
  }

  const cls = class CustomElement extends Base {
    #initialized = false;

    #html = spec.html({
      graphics: spec.graphics,
      stores: spec.stores,
      context: spec.context(spec.stores),
      state: spec.state,
      props: spec.props,
    });

    #renderFrameHandle = 0;

    #updateStateEvent = spec.updateStateEvent;
    get updateStateEvent() {
      return this.#updateStateEvent;
    }

    #shadowDOM = spec.shadowDOM;
    get shadowDOM() {
      return this.#shadowDOM;
    }

    #graphics = spec.graphics;
    get graphics() {
      return this.#graphics;
    }

    #stores = spec.stores;
    get stores() {
      return this.#stores;
    }

    #selectors = spec.selectors;
    get selectors() {
      return this.#selectors;
    }

    #ref = {} as RefMap<typeof this.selectors>;
    get ref() {
      return this.#ref;
    }

    #context = this.reduce(this.#stores);
    get context() {
      return this.#context;
    }

    #state = reactive(spec.state, (detail) =>
      emit(this.#updateStateEvent, detail, this)
    );
    get state() {
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
      return spec.tag;
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
      return spec.css;
    }

    /**
     * The innerHTML for this component.
     */
    get html() {
      return spec.html({
        graphics: this.graphics,
        stores: this.stores,
        context: this.context,
        state: this.state,
        props: this.props,
      });
    }

    get self(): ShadowRoot | CustomElement {
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
      this.#ref = this.getRefMap(this.selectors);
    }

    getRefMap<S extends Record<string, null | string | string[]>>(
      selectors: S
    ) {
      return Object.entries(selectors).reduce((obj, [key, value]) => {
        obj[key as keyof typeof obj] = (
          value
            ? Array.isArray(value)
              ? value.flatMap((v) =>
                  v
                    ? Array.from(this.self.querySelectorAll(v))
                    : [this.self.getElementById(key)]
                )
              : this.self.querySelector(value)
            : this.self.getElementById(key)
        ) as any;
        return obj;
      }, {} as RefMap<S>);
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
        if (this.shouldAttributeTriggerUpdate(name, oldValue, newValue)) {
          this.update();
        }
      }
    }

    /**
     * Invoked each time one of the element's attributes is added, removed, or changed.
     * Which attributes to notice change for is specified in a static get observedAttributes method
     */
    onAttributeChanged(name: string, newValue: string): void {}

    /**
     * @returns true if the attribute change should trigger a re-render, or false otherwise. Defaults to false.
     */
    shouldAttributeTriggerUpdate(
      name: string,
      oldValue: string,
      newValue: string
    ): boolean {
      return false;
    }

    /**
     * The callback that is invoked each time the custom element is appended into a document-connected element.
     * (This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.)
     */
    connectedCallback(): void {
      if (!this.#initialized) {
        this.onInit();
        this.#initialized = true;
      }
      if (this.stores) {
        Object.values(this.stores).forEach((store) => {
          store.target.addEventListener(store.event, this.#handleStoreUpdate);
        });
      }
      if (this.state) {
        this.addEventListener(this.updateStateEvent, this.#handleStateUpdate);
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
      if (this.stores) {
        Object.values(this.stores).forEach((store) => {
          store.target.removeEventListener(
            store.event,
            this.#handleStoreUpdate
          );
        });
      }
      if (this.state) {
        this.removeEventListener(
          this.updateStateEvent,
          this.#handleStateUpdate
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

    reduce(stores: Stores) {
      return spec.context(stores);
    }

    #handleStoreUpdate = (e: Event): void => {
      if (e instanceof CustomEvent) {
        this.onStoreUpdate();
        const oldContext = this.#context;
        const newContext = this.reduce(this.stores);
        this.#context = newContext;
        const changed = Object.entries(newContext).some(
          ([k, v]) => v !== oldContext[k]
        );
        if (changed) {
          this.onContextChanged(oldContext, newContext);
          if (this.shouldContextTriggerUpdate(oldContext, newContext)) {
            this.update();
          }
        }
      }
    };

    /**
     * Invoked when any store has been updated.
     */
    onStoreUpdate(): void {}

    /**
     * Invoked when the component's context has been updated.
    
     */
    onContextChanged(oldContext: Context, newContext: Context): void {}

    /**
     * @returns true if the attribute change should trigger a re-render, or false otherwise. Defaults to false.
     */
    shouldContextTriggerUpdate(
      oldContext: Context,
      newContext: Context
    ): boolean {
      return true;
    }

    #handleStateUpdate = (e: Event): void => {
      if (e.target === this) {
        if (e instanceof CustomEvent) {
          this.onStateChanged();
          if (this.shouldStateTriggerUpdate()) {
            this.update();
          }
        }
      }
    };

    /**
     * Invoked when the component's state has been updated.
     */
    onStateChanged(): void {}

    /**
     * @returns true if the change should trigger a re-render, or false otherwise. Defaults to true.
     */
    shouldStateTriggerUpdate(): boolean {
      return true;
    }

    /**
     * Re-renders the component if it has changed.
     * (Debounced so that updates can be batched, and the component will render at most once per frame.)
     */
    update() {
      if (this.#renderFrameHandle) {
        window.cancelAnimationFrame(this.#renderFrameHandle);
      }
      this.#renderFrameHandle = window.requestAnimationFrame(
        this.#update.bind(this)
      );
    }

    #update() {
      const innerHTML = this.html;
      if (innerHTML !== this.#html) {
        this.#html = innerHTML;
        this.render();
      }
    }

    render() {
      this.disconnectedCallback();
      if (this.shadowRoot) {
        this.shadowRoot.innerHTML = this.#html;
      } else {
        this.innerHTML = this.#html;
      }
      this.#ref = this.getRefMap(this.selectors);
      this.connectedCallback();
      this.onRender();
    }

    /**
     * Invoked when the component is rendered.
     */
    onRender(): void {}

    /**
     * Dispatches a cancelable, composed, bubbling event.
     * Returns true if either event's cancelable attribute value is false
     * or its preventDefault() method was not invoked, and false otherwise.
     */
    emit<T>(event: string, detail?: T): boolean {
      return emit(event, detail, this);
    }

    propagateEvent(event: Event): boolean {
      const propagatableEvent = new Event(event.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      Object.defineProperty(propagatableEvent, "target", {
        writable: false,
        value: event.target,
      });
      return this.dispatchEvent(propagatableEvent);
    }

    getElementById<T extends HTMLElement>(id: string): T | null {
      if (this.shadowRoot) {
        return (this.shadowRoot.getElementById(id) as T) || null;
      }
      return this.self.querySelector<T>(`#${id}`) || null;
    }
  };

  if (spec.props) {
    Object.entries(spec.props).forEach(([propName, v]) => {
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
    readonly tag: typeof cls.tag;
    readonly attrs: typeof cls.attrs;
    readonly observedAttributes: typeof cls.observedAttributes;
  } & T;
};

export default Component;
