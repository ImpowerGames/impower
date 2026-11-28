export interface Replica {
  readonly root: HTMLElement;
  of(element: Element): HTMLElement | undefined;
  source(element: Element): HTMLElement | undefined;
  dispose(): void;
}

const MEDIA = "video, audio, source, track, iframe, embed, object";

const LOADING = ["src", "srcdoc", "data", "autoplay"];

const isNode = (value: object): value is Node => typeof (value as Partial<Node>).nodeType === "number";

const isPlain = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export interface ReplicaOptions {
  carried: readonly string[];
  copy?: (from: Element, to: Element) => void;
  scope?: { element: HTMLElement; attribute: string };
}

function besideScope(twin: HTMLElement, scope: NonNullable<ReplicaOptions["scope"]>): HTMLElement {
  const { element, attribute } = scope;
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
  const value = (name: string) => computed?.getPropertyValue(name) ?? "";
  const container = element.ownerDocument.createElement("div");
  container.setAttribute(attribute, "");
  container.setAttribute("aria-hidden", "true");
  container.setAttribute("inert", "");
  container.style.setProperty("position", "absolute");
  container.style.setProperty("left", "0px");
  container.style.setProperty("top", "0px");
  container.style.setProperty("margin", "0px");
  container.style.setProperty("padding", "0px");
  container.style.setProperty("border", "0px none");
  container.style.setProperty("box-sizing", "content-box");
  container.style.setProperty("width", value("width") || `${element.clientWidth}px`);
  container.style.setProperty("height", value("height") || `${element.clientHeight}px`);
  for (const name of ["container-type", "container-name", "overflow-x", "overflow-y"]) {
    const own = value(name);
    if (own) {
      container.style.setProperty(name, own);
    }
  }
  container.style.setProperty("opacity", "0", "important");
  container.style.setProperty("visibility", "hidden", "important");
  container.style.setProperty("pointer-events", "none", "important");
  container.appendChild(twin);
  element.after(container);
  const target = element.getBoundingClientRect();
  const placed = container.getBoundingClientRect();
  const across = Number.parseFloat(container.style.width);
  const down = Number.parseFloat(container.style.height);
  const scaleX = across > 0 && placed.width > 0 ? placed.width / across : 1;
  const scaleY = down > 0 && placed.height > 0 ? placed.height / down : 1;
  container.style.setProperty("left", `${(target.left - placed.left) / scaleX}px`);
  container.style.setProperty("top", `${(target.top - placed.top) / scaleY}px`);
  return container;
}

export function replicate(root: HTMLElement, options: ReplicaOptions): Replica {
  const { carried, copy = () => {}, scope } = options;
  const twin = root.cloneNode(true) as HTMLElement;
  const originals = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const copies = [twin, ...Array.from(twin.querySelectorAll<HTMLElement>("*"))];
  const forward = new Map<Element, HTMLElement>();
  const back = new Map<Element, HTMLElement>();
  originals.forEach((original, index) => {
    const made = copies[index]!;
    forward.set(original, made);
    back.set(made, original);
  });
  for (const media of Array.from(twin.querySelectorAll(MEDIA))) {
    for (const name of LOADING) {
      media.removeAttribute(name);
    }
  }
  const memo = new Map<object, unknown>();
  const transfer = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (isNode(value)) {
      return forward.get(value as Element);
    }
    if (memo.has(value)) {
      return memo.get(value);
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      memo.set(value, out);
      for (const item of value) {
        out.push(transfer(item));
      }
      return out;
    }
    if (value instanceof Map) {
      const out = new Map<unknown, unknown>();
      memo.set(value, out);
      for (const [key, item] of value) {
        out.set(transfer(key), transfer(item));
      }
      return out;
    }
    if (value instanceof Set) {
      const out = new Set<unknown>();
      memo.set(value, out);
      for (const item of value) {
        out.add(transfer(item));
      }
      return out;
    }
    if (!isPlain(value)) {
      return value;
    }
    const out: Record<string, unknown> = {};
    memo.set(value, out);
    for (const [key, item] of Object.entries(value)) {
      out[key] = transfer(item);
    }
    return out;
  };
  for (const [original, made] of forward) {
    for (const key of carried) {
      if (Object.prototype.hasOwnProperty.call(original, key)) {
        (made as unknown as Record<string, unknown>)[key] = transfer((original as unknown as Record<string, unknown>)[key]);
      }
    }
    copy(original, made);
  }
  twin.setAttribute("aria-hidden", "true");
  twin.setAttribute("inert", "");
  twin.style.setProperty("opacity", "0", "important");
  twin.style.setProperty("visibility", "hidden", "important");
  twin.style.setProperty("pointer-events", "none", "important");
  const scrolled = originals.filter((original) => original.scrollTop !== 0 || original.scrollLeft !== 0);
  let placed: HTMLElement = twin;
  if (scope) {
    placed = besideScope(twin, scope);
  } else {
    root.after(twin);
  }
  for (const original of scrolled) {
    const made = forward.get(original)!;
    made.scrollTop = original.scrollTop;
    made.scrollLeft = original.scrollLeft;
  }
  return {
    root: twin,
    of: (element) => forward.get(element),
    source: (element) => back.get(element),
    dispose: () => placed.remove(),
  };
}
