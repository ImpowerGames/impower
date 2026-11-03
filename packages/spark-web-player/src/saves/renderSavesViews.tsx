import { render } from "preact";
import { SaveNote, SavesButton, SavesMenu, type SavesEvents } from "./SavesViews";
import type { SaveNoteState, SavesViewState } from "./savesView";

export interface SavesViewProps {
  state: SavesViewState;
  note: SaveNoteState | null;
  events: SavesEvents;
}

export const renderSavesViews = (
  targets: {
    button: HTMLElement | null;
    menu: HTMLElement | null;
    note: HTMLElement | null;
  },
  props: SavesViewProps | null,
): void => {
  if (targets.button) {
    render(
      props ? <SavesButton state={props.state} events={props.events} /> : null,
      targets.button,
    );
  }
  if (targets.menu) {
    render(
      props ? <SavesMenu state={props.state} events={props.events} /> : null,
      targets.menu,
    );
  }
  if (targets.note) {
    render(
      props ? <SaveNote note={props.note} events={props.events} /> : null,
      targets.note,
    );
  }
};
