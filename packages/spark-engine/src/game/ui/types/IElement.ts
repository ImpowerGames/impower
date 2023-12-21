import { ElementState } from "./ElementState";

export interface IElement {
  id: string;

  className: string;

  textContent: string;

  style: Record<string, string | null>;

  dataset: Record<string, string | undefined>;

  onclick: ((this: any, ev: any) => any) | null;

  init: (state: ElementState) => this;

  cloneChild: (index: number) => IElement | undefined;

  getChildren: () => IElement[];

  appendChild: (child: IElement) => void;

  removeChild: (child: IElement) => void;

  replaceChildren: (...children: IElement[]) => void;

  observeSize: (breakpoints: Record<string, number>) => () => void;

  setImportContent: (properties: Record<string, any>) => void;

  setAnimationContent: (
    animationName: string,
    properties: Record<string, any>,
    typeMap: { [type: string]: Record<string, any> }
  ) => void;

  setStyleContent: (
    targetName: string,
    properties: Record<string, any>,
    breakpoints: Record<string, number>,
    typeMap: { [type: string]: Record<string, any> }
  ) => void;

  setStyleProperty: (propName: string, propValue: unknown) => void;

  hasState: (state: string) => boolean;

  addState: (state: string) => void;

  removeState: (state: string) => void;
}
