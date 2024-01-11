import { ElementState } from "./ElementState";

export interface IElement {
  get type(): string;

  get id(): string;

  get name(): string;

  get text(): string;

  get style(): Readonly<Record<string, string | null>>;

  get attributes(): Readonly<Record<string, string | null>>;

  get children(): Readonly<IElement[]>;

  onclick: ((this: any, ev: any) => any) | null;

  onpointerdown: ((this: any, ev: any) => any) | null;

  onpointerup: ((this: any, ev: any) => any) | null;

  update: (state: ElementState) => this;

  cloneChild: (index: number) => IElement | undefined;

  getChild: (id: string) => IElement | undefined;

  findChild: (name: string) => IElement | undefined;

  findChildren: (...names: string[]) => IElement[];

  appendChild: (child: IElement) => IElement;

  removeChild: (child: IElement) => boolean;

  clear: () => void;

  observeSize: (breakpoints: Record<string, number>) => () => void;

  setImportContent: (properties: Record<string, any>) => void;

  setAnimationContent: (
    animationName: string,
    properties: Record<string, any>
  ) => void;

  setStyleContent: (
    targetName: string,
    properties: Record<string, any>,
    breakpoints: Record<string, number>
  ) => void;

  updateText: (text: string | undefined) => void;

  updateStyle: (
    style: Record<string, string | null> | null | undefined
  ) => void;

  updateAttributes: (
    attributes: Record<string, string | null> | null | undefined
  ) => void;

  getAttribute: (attr: string) => string | null;
}
