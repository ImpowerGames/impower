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

export type PreactElement<Props> = HTMLElement & Props;

export interface PreactElementConstructor<Props> {
  new (): PreactElement<Props>;
  register(tagName?: string): void;
}

export function PreactComponent<Props>(
  Component: FunctionComponent<Props> | ComponentClass<Props>,
  defaultTagName: string,
  propDefaults: Partial<Props>,
  options: Options,
): PreactElementConstructor<Props> {
  const observedAttributes = Object.keys(propDefaults as object) as (keyof Props)[];

  const BaseElement = register(
    Component,
    defaultTagName,
    observedAttributes,
    options,
  );

  class PreactComponentElement extends (BaseElement.constructor as CustomElementConstructor) {
    static async register(tagName: string = defaultTagName) {
      if (!customElements.get(tagName)) {
        customElements.define(tagName, this);
      }
      await customElements.whenDefined(tagName);
    }
  }

  return PreactComponentElement as unknown as PreactElementConstructor<Props>;
}
