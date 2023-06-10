import {
  getSearchQuery,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import elt from "crelt";

export interface SearchTextQuery {
  search: string;
  caseSensitive?: boolean;
  regexp?: boolean;
  replace?: string;
  action?: "search" | "find_next" | "find_previous" | "replace" | "replace_all";
}

export class SearchPanel implements Panel {
  dom: HTMLElement;

  query: SearchQuery;

  onOpen?: (view: EditorView) => void;

  onClose?: (view: EditorView) => void;

  constructor(
    readonly view: EditorView,
    events?: {
      onOpen?: (view: EditorView) => void;
      onClose?: (view: EditorView) => void;
    }
  ) {
    this.onOpen = events?.onOpen;
    this.onClose = events?.onClose;
    const query = getSearchQuery(view.state);
    this.query = query;

    const domAttrs = {
      class: "cm-search",
    };

    if (!this.dom) {
      const fakeEl = elt("div", { name: "search" });
      fakeEl["focus"] = (): void => {};
      fakeEl["select"] = (): void => {};
      this.dom = elt("div", domAttrs, [fakeEl]);
    }
  }

  update(update: ViewUpdate): void {
    update.transactions.forEach((tr) => {
      tr.effects.forEach((effect) => {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
          this.setQuery(effect.value);
        }
      });
    });
  }

  setQuery(query: SearchQuery): void {
    this.query = query;
  }

  mount(): void {
    if (this.onOpen) {
      this.onOpen(this.view);
    }
  }

  destroy(): void {
    if (this.onClose) {
      this.onClose(this.view);
    }
  }

  get pos(): number {
    return 80;
  }

  get top(): boolean {
    return true;
  }
}
