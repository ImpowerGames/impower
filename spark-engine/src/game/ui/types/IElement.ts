export interface IElement {
  id: string;

  className: string;

  textContent: string;

  style: Record<string, string | null>;

  dataset: Record<string, string | undefined>;

  onclick: ((this: any, ev: any) => any) | null;

  cloneChild: (index: number) => IElement | undefined;

  getChildren: () => IElement[];

  appendChild: (child: IElement) => void;

  removeChild: (child: IElement) => void;

  replaceChildren: (...children: IElement[]) => void;
}
