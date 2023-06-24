import { Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import LanguageClient from "../classes/LanguageClient";

const languageClientPlugin = (client: LanguageClient) =>
  ViewPlugin.fromClass(
    class {
      client: LanguageClient;

      decorations: DecorationSet = RangeSet.empty;

      constructor(view: EditorView) {
        this.client = client;
        this.init(view);
      }

      async init(view: EditorView) {
        await this.client.start();
        this.decorations = this.getColorDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = this.getColorDecorations(update.view);
        }
      }

      destroy() {
        this.client.stop();
      }

      getColorDecorations(_view: EditorView) {
        const decorations: Range<Decoration>[] = [];
        // TODO: create color decorations
        return Decoration.set(decorations);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

export default languageClientPlugin;
