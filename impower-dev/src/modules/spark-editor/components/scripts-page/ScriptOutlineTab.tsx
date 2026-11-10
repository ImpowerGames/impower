import { Button, ListRow, SearchIcon, VirtualList } from "@impower/impower-ui/components";
import { useMemo } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import { filterOutlineRows, OutlineRowIcon, outlineRows, type OutlineRow } from "../outline";
import { useSavedScroll, useTabQuery } from "./pageState";
import { SearchBox } from "../library-page";

export const OUTLINE_TAB = "outline";

const reveal = (uri: string, row: OutlineRow) =>
  void import("../../workspace/Workspace").then(({ Workspace }) => {
    Workspace.window.finishEditing();
    return Workspace.window.openOutlineLocation(uri, row.selection);
  });

export default function ScriptOutlineTab() {
  const snapshot = workspace.outline.value;
  const uri = snapshot?.uri;
  const [query, setQuery] = useTabQuery(OUTLINE_TAB);
  const scroller = useSavedScroll(OUTLINE_TAB);
  const all = useMemo(
    () =>
      outlineRows({
        symbols: snapshot?.symbols ?? [],
        diagnostics: snapshot?.diagnostics ?? [],
        firstContentLine: snapshot?.firstContentLine,
      }).rows,
    [snapshot],
  );
  const rows = useMemo(() => filterOutlineRows(all, query), [all, query]);
  const searching = !!query.trim();

  return (
    <div class="flex min-h-0 flex-1 flex-col px-4">
      <div class="flex flex-none items-center pt-4 pb-2">
        <SearchBox label="Search this script" value={query} onChange={setQuery} />
      </div>
      {uri && rows.length ? (
        <VirtualList
          listRef={scroller}
          label={searching ? "Search results" : "Scenes and choices"}
          class="-mr-4 flex-1 pt-2 pr-4 pb-5"
          items={rows}
          getKey={(row) => row.key}
          renderItem={(row) => (
            <ListRow
              depth={row.depth}
              icon={<OutlineRowIcon row={row} />}
              label={row.label}
              aria-label={row.accessibleName}
              onClick={() => reveal(uri, row)}
            />
          )}
        />
      ) : (
        <div class="flex flex-col items-center gap-3 px-5 py-14 text-center text-muted">
          {searching && <SearchIcon class="size-8" />}
          <h2 class="text-[16px] font-medium text-ink">
            {searching ? "No scenes match." : "Scenes will appear here as you write them."}
          </h2>
          {searching && (
            <Button variant="quiet" onClick={() => setQuery("")}>Clear search</Button>
          )}
        </div>
      )}
    </div>
  );
}
