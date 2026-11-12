import {
  BookmarkIcon,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@impower/impower-ui/components";
import { SavesMenu } from "@impower/spark-web-player/src/saves/SavesViews";
import { draftKeyOf, savesEscape } from "@impower/spark-web-player/src/saves/savesView";
import { useComputed } from "@preact/signals";
import saves from "../../workspace/saves/SavesStore";
import { PlayerViewScope } from "../preview-route";

export default function SavesMenuButton() {
  const view = useComputed(() => saves.view.value).value;
  const open = !!view?.open;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (view && next !== open) {
          saves.events.onOpen(next);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label="Saves"
          title="Saves"
          aria-haspopup="menu"
          aria-disabled={view ? undefined : true}
          class="text-muted aria-disabled:cursor-default aria-disabled:opacity-40 aria-expanded:bg-tint aria-expanded:text-accent"
        >
          <BookmarkIcon />
        </Button>
      </PopoverTrigger>
      {view ? (
        <PopoverContent
          frame="none"
          align="end"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            const escape = savesEscape(view, draftKeyOf(event.target));
            if (escape === "back") {
              saves.events.onBack();
            } else if (escape === "close") {
              saves.events.onOpen(false);
            }
          }}
        >
          <PlayerViewScope>
            <SavesMenu state={view} events={saves.events} />
          </PlayerViewScope>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
