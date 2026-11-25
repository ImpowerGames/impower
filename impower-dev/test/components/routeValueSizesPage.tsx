import { render } from "preact";
import { RouteList } from "@impower/spark-web-player/src/route/RouteViews";
import { SavesMenu, type SavesEvents } from "@impower/spark-web-player/src/saves/SavesViews";
import PlayerViewScope from "../../src/modules/spark-editor/components/preview-route/PlayerViewScope";

declare global {
  interface Window {
    routeValueSizes: { mount: () => void };
  }
}

const URI = "file:///project/main.sd";
const at = (line: number) => ({
  uri: URI,
  range: { start: { line: line - 1, character: 0 }, end: { line: line - 1, character: 0 } },
});

const LISTING = {
  start: "interrogation",
  items: [
    { key: "trust", group: "stores" as const, name: "trust", first: "0" },
    { key: "name", group: "stores" as const, name: "name", first: '"Bunny"' },
  ],
};

const SAVE = {
  id: "s1",
  kind: "saved" as const,
  name: "Before the trial",
  scene: "interrogation",
  line: 4,
  time: 0,
  gone: false,
};

const ignore = () => {};
const savesEvents = new Proxy({} as SavesEvents, { get: () => ignore });

window.routeValueSizes = {
  mount: () => {
    const host = document.body.appendChild(document.createElement("div"));
    render(
      <>
        <PlayerViewScope class="block w-[600px]">
          <RouteList
            state={{
              route: { start: { scene: "interrogation", location: at(4) }, target: at(9), decisions: [] },
              open: true,
              toggles: { pinned: true, auto: true, forced: true, clipped: true },
              tab: "values",
              values: { listing: LISTING, values: { trust: "3" }, drafts: {}, unsaved: {}, search: "" },
              pins: [],
            }}
            nameOf={() => "main"}
            onClose={ignore}
            onToggle={ignore}
            onShowLine={ignore}
            onTab={ignore}
            values={{ onSet: ignore, onClear: ignore, onDraft: ignore, onResetAll: ignore, onSearch: ignore }}
            onChangePins={ignore}
            onPinLastRun={ignore}
          />
        </PlayerViewScope>
        <PlayerViewScope class="block w-[300px]">
          <SavesMenu
            state={{
              open: true,
              playing: true,
              saves: [SAVE],
              values: {
                save: SAVE,
                values: { values: { trust: "5" }, frames: [] },
                listing: LISTING,
                search: "",
                drafts: {},
                unsaved: {},
              },
            }}
            events={savesEvents}
          />
        </PlayerViewScope>
      </>,
      host,
    );
  },
};
