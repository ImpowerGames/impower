/**
 * [D15] Consumer-side reconstruction of the engine's `UIModule.createImage`,
 * built against the real DOM from values the engine already resolved.
 *
 * The engine used to build this `instance` span (+ child `<img class="object">`)
 * itself and ship per-element `ui/create` ops; D15 ships the resolved
 * `background` CSS string / `src` / `imageNames` over `ui/write-image` instead,
 * and the renderer builds the layer here. Mirrors `getRevealAnimation`'s
 * relationship to text.
 *
 * The resolved `background` is applied to the given sparkle CSS `property` via
 * the supplied `applyStyle` (the same `getCssEquivalent` path the old
 * `ui/create` span used), so the realized inline style is byte-identical to the
 * pre-D15 DOM. `property` is `background_image` for `image` content elements and
 * `mask_image` for `mask` content elements (the engine resolves the same value
 * for both; only the target property differs). Matching the old `createImage`,
 * the instruction's pass-through position/inset style is NOT applied to the span.
 */
export const createImageElement = (
  parent: HTMLElement,
  property: string,
  background: string,
  imageNames: string,
  src: string | undefined,
  applyStyle: (
    el: HTMLElement,
    style: Record<string, string | number | null>,
  ) => void,
): HTMLElement => {
  const doc = parent.ownerDocument;
  const el = doc.createElement("span");
  el.className = "instance";
  el.setAttribute("image", imageNames);
  applyStyle(el, { [property]: background });
  if (src) {
    const img = doc.createElement("img");
    img.className = "object";
    img.setAttribute("src", src);
    el.appendChild(img);
  }
  parent.appendChild(el);
  return el;
};
