import { Button, CloseIcon, PanelHead } from "@impower/impower-ui/components";
import workspace from "../../workspace/WorkspaceStore";
import FindView from "./FindView";
import ReferencesView from "./ReferencesView";
import RenameView from "./RenameView";
import { searchTitle } from "./scriptTitle";
import { withSearch } from "./withSearch";

export default function SearchRail() {
  const snapshot = workspace.search.value;
  if (!snapshot.open) {
    return null;
  }
  const title = searchTitle(snapshot);

  return (
    <section
      aria-label={title}
      data-view={snapshot.view}
      class="flex h-full min-h-0 flex-col"
    >
      <PanelHead
        size="compact"
        edge={false}
        titleSize="sm"
        class="gap-0 pr-1 pl-[10px] in-data-[layout=compact]:pl-1.5 in-data-[view=references]:pl-5"
        title={title}
        end={
          <Button
            variant="quiet"
            size="icon"
            class="flex-none text-muted"
            name="close"
            aria-label="Back to outline"
            title="Back to outline"
            onClick={() => withSearch((search) => search.close())}
          >
            <CloseIcon />
          </Button>
        }
      />
      {snapshot.view === "find" ? (
        <FindView />
      ) : snapshot.view === "references" ? (
        <ReferencesView />
      ) : (
        <RenameView />
      )}
    </section>
  );
}
