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
  register(tagName?: string): Promise<CustomElementConstructor>;
}

export interface Lifecycle {
  connectedCallback?(this: HTMLElement): void;
  disconnectedCallback?(this: HTMLElement): void;
}

export function PreactComponent<Props>(
  Component: FunctionComponent<Props> | ComponentClass<Props>,
  defaultTagName: string,
  propDefaults: Partial<Props>,
  options: Options,
  lifecycle?: Lifecycle,
): PreactElementConstructor<Props> {
  if (typeof customElements === "undefined") {
    class SSRStub {
      static async register() {
        return SSRStub as unknown as CustomElementConstructor;
      }
    }
    return SSRStub as unknown as PreactElementConstructor<Props>;
  }

  const observedAttributes = Object.keys(propDefaults as object) as (keyof Props)[];

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
