import { Facet } from "@codemirror/state";

export const coarsePointer = Facet.define<boolean, boolean>({
  combine: (values) => values.some((value) => value),
});
