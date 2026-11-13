import { FileIcon, ListRow } from "@impower/impower-ui/components";
import type { Range } from "vscode-languageserver-protocol";
import type { SearchGroup, SearchUse } from "../../workspace/searchState";
import { scriptTitle } from "./scriptTitle";

const LEADING_SPACE = /^\s*/;

function Snippet({ use }: { use: SearchUse }) {
  const lead = LEADING_SPACE.exec(use.lineText)?.[0].length ?? 0;
  const text = use.lineText.slice(lead);
  const from = Math.max(0, use.range.start.character - lead);
  const to =
    use.range.end.line === use.range.start.line
      ? Math.max(from, use.range.end.character - lead)
      : text.length;
  return (
    <span class="block font-mono text-[13px]/[1.4] [--fade:20px] fade-edge">
      {text.slice(0, from)}
      <mark class="rounded-[3px] bg-accent/25 text-ink">
        {text.slice(from, to)}
      </mark>
      {text.slice(to)}
    </span>
  );
}

const isCurrent = (
  use: SearchUse,
  current: { uri: string; range: Range } | undefined,
) =>
  !!current &&
  current.uri === use.uri &&
  current.range.start.line === use.range.start.line &&
  current.range.start.character === use.range.start.character &&
  current.range.end.line === use.range.end.line &&
  current.range.end.character === use.range.end.character;

function UseLines({ groups, onOpen }: { groups: readonly SearchGroup[]; onOpen: (use: SearchUse) => void }) {
  return (
    <ul class="m-0 list-none p-0">
      {groups.flatMap((group) => {
        const title = scriptTitle(group.uri);
        return group.uses.map((use) => {
          const line = use.range.start.line + 1;
          return (
            <li key={`${group.uri}:${use.range.start.line}:${use.range.start.character}`}>
              <ListRow
                icon={<FileIcon />}
                aria-label={`Open ${title} at line ${line}`}
                label={`${title} · line ${line}`}
                description={use.lineText.trim()}
                onClick={() => onOpen(use)}
              />
            </li>
          );
        });
      })}
    </ul>
  );
}

export default function UsesList({
  groups,
  current,
  layout = "grouped",
  onOpen,
}: {
  groups: readonly SearchGroup[];
  current?: { uri: string; range: Range };
  layout?: "grouped" | "lines";
  onOpen: (use: SearchUse) => void;
}) {
  if (layout === "lines") {
    return <UseLines groups={groups} onOpen={onOpen} />;
  }
  return (
    <>
      {groups.map((group) => (
        <section key={group.uri} aria-label={scriptTitle(group.uri)}>
          <h3 class="m-0 mt-2.5 mb-0.5 flex items-baseline justify-between gap-2 px-2 text-[12px]/[1.4] font-semibold text-ink">
            <span class="min-w-0 truncate">{scriptTitle(group.uri)}</span>
            <small class="flex-none text-[12px] font-normal text-muted">
              ({group.uses.length})
            </small>
          </h3>
          <ul class="m-0 list-none p-0">
            {group.uses.map((use) => (
              <li
                key={`${use.range.start.line}:${use.range.start.character}`}
                class="h-11"
              >
                <ListRow
                  size="compact"
                  current={isCurrent(use, current)}
                  aria-label={`Line ${use.range.start.line + 1}: ${use.lineText.trim()}${
                    use.declaration ? ", where it is defined" : ""
                  }`}
                  icon={
                    <span
                      aria-hidden="true"
                      data-declaration={use.declaration ? "" : undefined}
                      class="w-[3ch] flex-none text-right font-mono text-[12px]/[1.4] text-muted data-[declaration]:font-bold data-[declaration]:text-accent"
                    >
                      {use.range.start.line + 1}
                    </span>
                  }
                  overflow="self"
                  label={<Snippet use={use} />}
                  onClick={() => onOpen(use)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
