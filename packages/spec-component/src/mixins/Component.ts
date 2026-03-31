import Idiomorph from "../idiomorph/idiomorph";
import { ComponentSpec } from "../types/ComponentSpec";
import { IStore } from "../types/IStore";
import { RefMap } from "../types/RefMap";
import convertCamelToKebabCase from "../utils/convertCamelToKebabCase";
import convertHostToTagSelectors from "../utils/convertHostToTagSelectors";
import emit from "../utils/emit";
import getPropValue from "../utils/getPropValue";

abstract class Styles {
  static cache = new Map<string, { cssText: string; sheet: CSSStyleSheet }>();
}

const Component = <
  Props extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>,
  T extends CustomElementConstructor,
>(
  spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>,
  Base: T = HTMLElement as T,
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
      context: spec.reducer({ props: spec.props, stores: spec.stores }),
      props: spec.props,
    });

    #renderFrameHandle = 0;

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

    #refs = {} as RefMap<typeof this.selectors>;
    get refs() {
      return this.#refs;
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

    #context = this.reduce({ props: this.#props, stores: this.#stores });
    get context() {
      return this.#context;
    }
    set context(value) {
      this.#context = value;
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
      return this.#css;
    }
    #css = spec.css;

    /**
     * The css that is shared between this component and others.
     */
    get sharedCSS() {
      return this.#sharedCSS;
    }
    #sharedCSS = spec.sharedCSS;

    /**
     * The innerHTML for this component.
     */
    get html() {
      return spec.html({
        graphics: this.graphics,
        stores: this.stores,
        context: this.context,
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

    get styleSheetRoot() {
      if (this.shadowRoot) {
        return this.shadowRoot;
      }
      const rootNode = this.getRootNode();
      const root =
        rootNode instanceof ShadowRoot
          ? rootNode
          : rootNode instanceof HTMLElement
            ? (rootNode.shadowRoot ?? document)
            : document;
      return root;
    }

    get adoptedStyleSheets() {
      return this.styleSheetRoot.adoptedStyleSheets;
    }

    constructor(..._args: any[]) {
      super();
      const css = this.css;
      this.#css = css;
      const sharedCSS = this.sharedCSS;
      this.#sharedCSS = sharedCSS;
      const innerHTML = this.html;
      this.#html = innerHTML;

      if (this.shadowDOM) {
        const shadowRoot = this.attachShadow({
          mode: "open",
          delegatesFocus: true,
        });
        shadowRoot.innerHTML = innerHTML;
      } else {
        this.innerHTML = innerHTML;
      }

      this.loadCSS(this.#css);
      if (this.#sharedCSS) {
        for (const [name, css] of Object.entries(this.#sharedCSS)) {
          this.loadSharedCSS(name, css);
        }
      }

      this.#refs = this.getRefMap(this.selectors);
    }

    reload(spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>) {
      if (spec.css !== this.#css) {
        this.loadCSS(spec.css);
        this.#css = spec.css;
      }
      if (spec.sharedCSS !== this.#sharedCSS) {
        if (spec.sharedCSS) {
          for (const [name, css] of Object.entries(spec.sharedCSS)) {
            if (css !== this.#sharedCSS?.[name]) {
              this.loadSharedCSS(name, css);
            }
          }
        }
        this.#sharedCSS = spec.sharedCSS;
      }
      const newHtml = spec.html({
        graphics: spec.graphics,
        stores: spec.stores,
        context: spec.reducer({ props: spec.props, stores: spec.stores }),
        props: spec.props,
      });
      if (newHtml !== this.#html) {
        this.#html = spec.html({
          graphics: spec.graphics,
          stores: spec.stores,
          context: spec.reducer({ props: spec.props, stores: spec.stores }),
          props: spec.props,
        });
        this.disconnectedCallback();
        this.render(false);
        this.connectedCallback();
      }
    }

    loadCSS(cssText: string | undefined) {
      const tag = this.tagName.toLowerCase();
      if (tag) {
        if (cssText) {
          const augmentedCSS = this.shadowDOM
            ? cssText
            : convertHostToTagSelectors(cssText, tag);
          let style = Styles.cache.get(tag);
          if (style && this.adoptedStyleSheets.includes(style.sheet)) {
            if (style.cssText !== augmentedCSS) {
              style.sheet.replaceSync(augmentedCSS);
              style.cssText = augmentedCSS;
            }
          } else if (style) {
            if (style.cssText !== augmentedCSS) {
              style.sheet.replaceSync(augmentedCSS);
              style.cssText = augmentedCSS;
            }
            this.adoptedStyleSheets.push(style.sheet);
          } else {
            const style = { cssText: augmentedCSS, sheet: new CSSStyleSheet() };
            style.sheet.replaceSync(augmentedCSS);
            style.cssText = cssText;
            Styles.cache.set(tag, style);
            this.adoptedStyleSheets.push(style.sheet);
          }
        } else {
          const style = Styles.cache.get(tag);
          style?.sheet?.replaceSync("");
        }
      }
    }

    loadSharedCSS(name: string, cssText: string) {
      if (name) {
        let style = Styles.cache.get(name);
        if (style && this.adoptedStyleSheets.includes(style.sheet)) {
          if (style.cssText !== cssText) {
            style.sheet.replaceSync(cssText);
            style.cssText = cssText;
          }
        } else if (style) {
          if (style.cssText !== cssText) {
            style.sheet.replaceSync(cssText);
            style.cssText = cssText;
          }
          this.adoptedStyleSheets.push(style.sheet);
        } else {
          const style = { cssText: cssText, sheet: new CSSStyleSheet() };
          style.sheet.replaceSync(cssText);
          style.cssText = cssText;
          Styles.cache.set(name, style);
          this.adoptedStyleSheets.push(style.sheet);
        }
      }
    }

    getRefMap<S extends Record<string, null | string | string[]>>(
      selectors: S,
    ) {
      return Object.entries(selectors).reduce((obj, [key, value]) => {
        obj[key as keyof typeof obj] = (
          value
            ? Array.isArray(value)
              ? value.flatMap((v) =>
                  v
                    ? Array.from(this.self.querySelectorAll(v))
                    : [this.self.getElementById(key)],
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
      newValue: string,
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
    onAttributeChanged(_name: string, _newValue: string): void {}

    /**
     * @returns true if the attribute change should trigger a re-render, or false otherwise. Defaults to false.
     */
    shouldAttributeTriggerUpdate(
      _name: string,
      _oldValue: string,
      _newValue: string,
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
            this.#handleStoreUpdate,
          );
        });
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

    reduce(args: { props: Props; stores: Stores }) {
      return spec.reducer(args);
    }

    #handleStoreUpdate = (e: Event): void => {
      if (e instanceof CustomEvent) {
        this.onStoreUpdate();
        const oldContext = this.#context;
        const newContext = this.reduce({
          props: this.#props,
          stores: this.#stores,
        });
        this.#context = newContext;
        const changed = Object.entries(newContext).some(
          ([k, v]) => v !== oldContext[k],
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
    onContextChanged(_oldContext: Context, _newContext: Context): void {}

    /**
     * @returns true if the attribute change should trigger a re-render, or false otherwise. Defaults to true.
     */
    shouldContextTriggerUpdate(
      _oldContext: Context,
      _newContext: Context,
    ): boolean {
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
        this.#update.bind(this),
      );
    }

    #update() {
      const innerHTML = this.html;
      this.#html = innerHTML;
      this.disconnectedCallback();
      this.render(true);
      this.connectedCallback();
    }

    render(morph: boolean) {
      if (morph) {
        if (this.shadowRoot) {
          this.morph(this.shadowRoot, this.#html);
        } else {
          this.morph(this, this.#html);
        }
      } else {
        if (this.shadowRoot) {
          this.shadowRoot.innerHTML = this.#html;
        } else {
          this.innerHTML = this.#html;
        }
      }
      this.rebindRefs();
      this.onRender();
    }

    morph(parent: Node, innerHTML: Node | string) {
      Idiomorph.morph(parent, innerHTML, {
        morphStyle: "innerHTML",
        callbacks: {
          beforeNodeMorphed: (oldNode: Element, newNode: Element): boolean => {
            if (oldNode?.tagName?.toLowerCase() === "s-router") {
              for (const attr of newNode.attributes) {
                oldNode.setAttribute(attr.name, attr.value);
              }
              for (const attr of oldNode.attributes) {
                if (newNode.getAttribute(attr.name) == null) {
                  oldNode.removeAttribute(attr.name);
                }
              }
              return false;
            }
            return true;
          },
        },
      });
    }

    rebindRefs() {
      this.#refs = this.getRefMap(this.selectors);
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
