import { type ComponentClass, type FunctionComponent } from "preact";
import register from "preact-custom-element";

export type Options =
  | {
      shadow: false;
    }
  | {
      shadow: true;
      mode?: "open" | "closed";
      adoptedStyleSheets?: CSSStyleSheet[];
      serializable?: boolean;
    };

export type PreactElement<Props> = HTMLElement &
  Props & {
    connectedCallback?(): void;
    disconnectedCallback?(): void;
    attributeChangedCallback?(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ): void;
  };

export interface PreactElementConstructor<Props> {
  new (): PreactElement<Props>;
  // Default tag name baked in by PreactComponent(); callers can override.
  register(tagName?: string): Promise<CustomElementConstructor>;
}

export interface Lifecycle {
  // Runs in connectedCallback BEFORE preact-custom-element renders into the
  // host. Use this to set default attributes (tabindex, role) and attach
  // host-level event listeners.
  connectedCallback?(this: HTMLElement): void;
  // Runs in disconnectedCallback BEFORE preact-custom-element unmounts.
  disconnectedCallback?(this: HTMLElement): void;
}

export function PreactComponent<Props>(
  Component: FunctionComponent<Props> | ComponentClass<Props>,
  defaultTagName: string,
  propDefaults: Partial<Props>,
  options: Options,
  lifecycle?: Lifecycle,
): PreactElementConstructor<Props> {
  // SSR / Node guard. `customElements` is browser-only. Returning a stub
  // here is safe because the constructor isn't instantiated server-side and
  // .register() is a no-op when called in a non-browser environment.
  if (typeof customElements === "undefined") {
    class SSRStub {
      static async register() {
        return SSRStub as unknown as CustomElementConstructor;
      }
    }
    return SSRStub as unknown as PreactElementConstructor<Props>;
  }

  const observedAttributes = Object.keys(propDefaults as object) as (keyof Props)[];

  // Build the custom-element class WITHOUT defining it. preact-custom-element
  // always calls customElements.define when given a Component (falling back
  // to Component.name if no tagName), so we no-op define temporarily, let
  // register() build the class and return it, then restore. Registration is
  // deferred to the static .register() method below.
  const originalDefine = customElements.define.bind(customElements);
  let BaseCtor: CustomElementConstructor;
  customElements.define = (() => undefined) as typeof customElements.define;
  try {
    BaseCtor = register(
      Component,
      defaultTagName,
      observedAttributes as (keyof Props)[],
      options,
    ) as unknown as CustomElementConstructor;
  } finally {
    customElements.define = originalDefine;
  }

  // Patch lifecycle on the base prototype BEFORE define snapshots it. Per the
  // HTML spec, customElements.define captures the connectedCallback /
  // disconnectedCallback methods at registration time; later prototype edits
  // are never invoked. So we apply our wrappers eagerly, here.
  if (lifecycle) {
    const proto = BaseCtor.prototype as PreactElement<Props>;
    if (lifecycle.connectedCallback) {
      const original = proto.connectedCallback;
      const hook = lifecycle.connectedCallback;
      proto.connectedCallback = function () {
        hook.call(this);
        original?.call(this);
      };
    }
    if (lifecycle.disconnectedCallback) {
      const original = proto.disconnectedCallback;
      const hook = lifecycle.disconnectedCallback;
      proto.disconnectedCallback = function () {
        hook.call(this);
        original?.call(this);
      };
    }
  }

  // Don't extend with `class X extends BaseCtor` — preact-custom-element
  // builds its PreactElement as a function-style class that throws
  // "Illegal constructor" when subclassed via ES class syntax. Tack the
  // static .register onto the existing class instead.
  (BaseCtor as unknown as {
    register: (tagName?: string) => Promise<CustomElementConstructor>;
  }).register = async function (tagName: string = defaultTagName) {
    if (typeof customElements === "undefined") {
      return BaseCtor as unknown as CustomElementConstructor;
    }
    const existing = customElements.get(tagName);
    if (!existing) {
      customElements.define(tagName, BaseCtor);
    }
    await customElements.whenDefined(tagName);
    return (customElements.get(tagName) ??
      BaseCtor) as unknown as CustomElementConstructor;
  };

  return BaseCtor as unknown as PreactElementConstructor<Props>;
}
