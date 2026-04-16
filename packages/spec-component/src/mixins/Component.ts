import { Styles } from "../caches/Styles";
import { Templates } from "../caches/Templates";
import Idiomorph from "../idiomorph/idiomorph";
import { ComponentSpec } from "../types/ComponentSpec";
import { IStore } from "../types/IStore";
import { RefMap } from "../types/RefMap";
import { convertCamelToKebabCase } from "../utils/convertCamelToKebabCase";
import { convertHostToTagSelectors } from "../utils/convertHostToTagSelectors";
import { emit } from "../utils/emit";
import { getPropValue } from "../utils/getPropValue";

export interface IComponent<
  Props extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>,
> {
  shadowDOM: boolean;
  graphics: Graphics;
  stores: Stores;
  selectors: Selectors;
  refs: RefMap<Selectors>;
  props: Props;
  context: Context;
  attrs: Record<keyof Props, string>;
  css?: string;
  sharedCSS?: Record<string, string>;
  html: string;
  self: ShadowRoot | HTMLElement;
  root: HTMLElement;
  contentSlot: HTMLSlotElement | null;
  styleSheetRoot: ShadowRoot | Document;
  skipMorphingChildren: boolean;
  skipMorphingAttributes: string[];
  reload(
    spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>,
  ): void;
  loadCSS(cssText: string | undefined): void;
  loadSharedCSS(name: string, cssText: string): void;
  getRefMap<S extends Record<string, null | string | string[]>>(
    selectors: S,
  ): RefMap<S>;
  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string,
  ): void;
  onAttributeChanged(name: string, newValue: string): void;
  shouldAttributeTriggerUpdate(
    name: string,
    oldValue: string,
    newValue: string,
  ): boolean;
  connectedCallback(): void;
  onConnected(): void;
  disconnectedCallback(): void;
  onDisconnected(): void;
  onInit(): void;
  reduce(args: { props: Props; stores: Stores }): void;
  onStoreUpdate(): void;
  onContextChanged(oldContext: Context, newContext: Context): void;
  shouldContextTriggerUpdate(oldContext: Context, newContext: Context): boolean;
  update(): void;
  render(morph: boolean): void;
  morph(parent: Node, innerHTML: Node | string): void;
  beforeNodeMorphed(oldNode: Element, newNode: Element): boolean;
  afterNodeMorphed(oldNode: Element, newNode: Element): void;
  rebindRefs(): void;
  onRender(): void;
  emit<T>(event: string, detail?: T): boolean;
  getElementById<T extends HTMLElement>(id: string): T | null;
}

export const Component = <
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

  class CustomElement
    extends Base
    implements IComponent<Props, Stores, Context, Graphics, Selectors>
  {
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

    get attrs() {
      return propToAttrMap;
    }

    /**
     * Attributes that will cause attributeChangedCallback to be called whenever they are added, removed, or changed.
     */
    static get observedAttributes() {
      const observed = Object.values(this.attrs);
      return observed;
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
      return (this.shadowRoot?.firstElementChild as HTMLElement) || this;
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

    get skipMorphingChildren() {
      return false;
    }

    get skipMorphingAttributes(): string[] {
      return [];
    }

    constructor(..._args: any[]) {
      super();

      const css = this.css;
      this.#css = css;
      const sharedCSS = this.sharedCSS;
      this.#sharedCSS = sharedCSS;
      const html = this.html;
      this.#html = html;

      // Fetch from cache (parses only if it's the first time this exact string is seen)
      const template = this.#getTemplate(this.#html);
      const fragment = template.content.cloneNode(true);

      if (this.shadowDOM) {
        const shadowRoot = this.attachShadow({
          mode: "open",
          delegatesFocus: true,
        });
        shadowRoot.replaceChildren(fragment);
      } else {
        if (this.#html) {
          this.replaceChildren(fragment);
        }
      }

      this.loadCSS(this.#css);
      if (this.#sharedCSS) {
        for (const [name, css] of Object.entries(this.#sharedCSS)) {
          this.loadSharedCSS(name, css);
        }
      }

      this.onRender();

      this.#refs = this.getRefMap(this.selectors);
    }

    #getTemplate(htmlString: string): HTMLTemplateElement {
      let template = Templates.cache.get(htmlString);
      if (!template) {
        template = document.createElement("template");
        template.innerHTML = htmlString;
        Templates.cache.set(htmlString, template);
      }
      return template;
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
          graphics: this.graphics,
          stores: this.stores,
          context: this.context,
          props: this.props,
        });
        this.disconnectedCallback();
        this.render(false);
        this.connectedCallback();
      }
    }

    loadCSS(cssText: string | undefined) {
      const tag = this.tagName.toLowerCase();
      if (cssText) {
        const augmentedCSS = this.shadowDOM
          ? cssText
          : convertHostToTagSelectors(cssText, tag);
        Styles.adoptStyle(this.styleSheetRoot, tag, augmentedCSS);
      } else {
        Styles.removeStyle(this.styleSheetRoot, tag);
      }
    }

    loadSharedCSS(name: string, cssText: string) {
      Styles.adoptStyle(this.styleSheetRoot, name, cssText);
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
      this.rebindRefs();
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
      const html = this.html;
      if (html !== this.#html) {
        this.#html = html;
        this.disconnectedCallback();
        this.render(true);
        this.connectedCallback();
      }
    }

    render(morph: boolean) {
      // Fetch from cache (parses only if it's the first time this exact string is seen)
      const template = this.#getTemplate(this.#html);
      const fragment = template.content.cloneNode(true);

      if (morph) {
        if (this.shadowRoot) {
          this.morph(this.shadowRoot, fragment);
        } else {
          this.morph(this, fragment);
        }
      } else {
        if (this.shadowRoot) {
          this.shadowRoot.replaceChildren(fragment);
        } else {
          if (this.#html) {
            this.replaceChildren(fragment);
          }
        }
      }
      this.onRender();
    }

    morph(parent: Node, innerHTML: Node | string) {
      Idiomorph.morph(parent, innerHTML, {
        morphStyle: "innerHTML",
        callbacks: {
          beforeAttributeUpdated: (
            attributeName: string,
            node: Element,
            mutationType: "update" | "remove",
          ) => {
            if (
              "skipMorphingAttributes" in node &&
              node?.skipMorphingAttributes &&
              Array.isArray(node?.skipMorphingAttributes) &&
              node?.skipMorphingAttributes.includes(attributeName)
            ) {
              return false;
            }
            return true;
          },
          beforeNodeMorphed: (oldNode: Element, newNode: Element): boolean => {
            if (
              "skipMorphingChildren" in oldNode &&
              oldNode?.skipMorphingChildren
            ) {
              if (newNode && newNode.attributes) {
                for (const attr of newNode.attributes) {
                  oldNode.setAttribute(attr.name, attr.value);
                }
              }
              if (oldNode && oldNode.attributes) {
                for (const attr of oldNode.attributes) {
                  if (newNode.getAttribute(attr.name) == null) {
                    oldNode.removeAttribute(attr.name);
                  }
                }
              }
              return false;
            }
            if (
              "beforeNodeMorphed" in newNode &&
              typeof newNode?.beforeNodeMorphed === "function"
            ) {
              return newNode.beforeNodeMorphed(oldNode, newNode);
            }
            return true;
          },
          afterNodeMorphed: (oldNode: Element, newNode: Element): void => {
            if (
              "afterNodeMorphed" in oldNode &&
              typeof oldNode?.afterNodeMorphed === "function"
            ) {
              oldNode.afterNodeMorphed(oldNode, newNode);
            }
          },
        },
      });
    }

    beforeNodeMorphed(oldNode: Element, newNode: Element): boolean {
      return true;
    }

    afterNodeMorphed(oldNode: Element, newNode: Element): void {}

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
  }

  if (spec.props) {
    Object.entries(spec.props).forEach(([propName, v]) => {
      const attrName = propToAttrMap[propName as keyof Props];
      Object.defineProperty(CustomElement.prototype, propName, {
        get(this: InstanceType<typeof CustomElement>) {
          if (attrName) {
            const attrValue = this.getAttribute(attrName);
            return getPropValue(attrValue, v);
          } else {
            return null;
          }
        },
        set(this: InstanceType<typeof CustomElement>, value) {
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

  return CustomElement as unknown as T & {
    get tag(): `${string}-${string}`;
    get attrs(): Record<keyof Props, string>;
    get observedAttributes(): string[];
  } & {
    new (
      ...args: any[]
    ): Props & IComponent<Props, Stores, Context, Graphics, Selectors>;
  };
};
