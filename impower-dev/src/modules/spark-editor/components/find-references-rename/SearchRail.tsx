import { Button, CloseIcon } from "@impower/impower-ui/components";
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
      <div class="flex h-11 flex-none items-center justify-between gap-1 pr-1 pl-[14px] in-data-[layout=compact]:pl-2.5 in-data-[view=references]:pl-6">
        <h2 class="m-0 min-w-0 truncate text-[14px]/[1.4] font-semibold text-ink">
          {title}
        </h2>
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
      </div>
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
