import { ListRow } from "@impower/impower-ui/components";
import { iconForPath } from "../../utils/fileIcon";
import { count } from "../../workspace/WorkspaceSearch";
import workspace from "../../workspace/WorkspaceStore";
import { fileTitle } from "./scriptTitle";
import UsesList from "./UsesList";
import { withSearch } from "./withSearch";

export default function ReferencesView() {
  const { subject, references, files } = workspace.search.value;
  const total = references.reduce((n, g) => n + g.uses.length, 0);

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-[14px] pb-3 in-data-[layout=compact]:px-2.5">
      {total ? (
        <p class="m-0 mx-2 mb-1.5 text-[12px]/[1.5] text-muted">
          {count(total, "reference")} in {count(references.length, "script")}
        </p>
      ) : (
        <p class="m-0 px-2 py-1 text-[12px]/[1.5] text-muted">
          No script uses {subject?.name || "it"} yet.
        </p>
      )}
      <UsesList
        groups={references}
        onOpen={(use) => withSearch((search) => search.openUse(use))}
      />
      {files.length > 0 && (
        <section aria-label="Linked assets">
          <h3 class="m-0 mt-2.5 mb-0.5 flex items-baseline justify-between gap-2 px-2 text-[12px]/[1.4] font-semibold text-ink">
            <span>Linked assets</span>
            <small class="text-[12px] font-normal text-muted">
              ({files.length})
            </small>
          </h3>
          <ul class="m-0 list-none p-0">
            {files.map((uri) => {
              const FileIcon = iconForPath(uri, false);
              return (
                <li key={uri} class="h-11">
                  <ListRow
                    size="compact"
                    icon={<FileIcon />}
                    label={fileTitle(uri)}
                    title={`Open ${fileTitle(uri)} in Assets`}
                    onClick={() => withSearch((search) => search.openAsset(uri))}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
