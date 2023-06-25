import { Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate,
} from "@codemirror/view";

export default class ColorViewPlugin {
  decorations: DecorationSet = RangeSet.empty;

  constructor(view: EditorView) {}

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = this.getColorDecorations(update.view);
    }
  }

  destroy() {}

  getColorDecorations(_view: EditorView) {
    const decorations: Range<Decoration>[] = [];
    // TODO: create color decorations
    return Decoration.set(decorations);
  }
}
