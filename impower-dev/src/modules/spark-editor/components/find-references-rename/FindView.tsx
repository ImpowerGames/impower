import {
  DownIcon,
  ReplaceAllIcon,
  ReplaceIcon,
  TextField,
  UpIcon,
} from "@impower/impower-ui/components";
import { useRef } from "preact/hooks";
import { count } from "../../workspace/WorkspaceSearch";
import { useScriptMode } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import {
  FormButton,
  MatchSwitches,
  onFindKeyDown,
  useFieldFocus,
} from "./findControls";
import UsesList from "./UsesList";
import { withSearch } from "./withSearch";

export default function FindView() {
  const snapshot = workspace.search.value;
  const position = workspace.searchPosition.value;
  const field = useRef<HTMLInputElement>(null);
  useFieldFocus(field, snapshot.focusRequest);
  const reading = useScriptMode() === "reading";

  const { term, total, error, status, statusTone, groups, options } = snapshot;
  const summary =
    term && !error && total
      ? `${position.index ? `${position.index} of ` : ""}${count(total, "match", "matches")} in ${count(groups.length, "script")}`
      : "";
  const line = error
    ? error
    : status || (term && !total ? "No matches in any script." : "");
  const tone = error ? "error" : statusTone;

  return (
    <>
      <form
        class="flex-none px-[14px] pt-0.5 pb-2 in-data-[layout=compact]:px-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          withSearch((search) => search.step());
        }}
        onKeyDown={onFindKeyDown}
      >
        <div class="flex items-center gap-0.5">
          <TextField
            ref={field}
            width="full"
            class="flex-1"
            placeholder="Find"
            name="search"
            aria-label="Words to find"
            value={term}
            onValueChange={(value) => withSearch((search) => search.setTerm(value))}
          />
          <FormButton
            name="prev"
            label="Previous match"
            title="Previous match (Shift Enter)"
            onClick={() => withSearch((search) => search.step(true))}
          >
            <UpIcon />
          </FormButton>
          <FormButton
            name="next"
            label="Next match"
            title="Next match (Enter)"
            onClick={() => withSearch((search) => search.step())}
          >
            <DownIcon />
          </FormButton>
        </div>
        <div class="mt-1.5 flex items-center gap-0.5">
          <TextField
            width="full"
            class="flex-1"
            placeholder={reading ? "Tap Edit to replace." : "Replace"}
            disabled={reading}
            name="replace"
            aria-label="Replace with"
            value={snapshot.replacement}
            onValueChange={(value) =>
              withSearch((search) => search.setReplacement(value))
            }
          />
          <FormButton
            name="replace"
            label="Replace this match"
            title={reading ? "Tap Edit to replace." : undefined}
            disabled={reading}
            onClick={() => withSearch((search) => search.replaceOne())}
          >
            <ReplaceIcon />
          </FormButton>
          <FormButton
            name="replaceAll"
            label="Replace all matches"
            title={reading ? "Tap Edit to replace." : undefined}
            disabled={reading}
            onClick={() => withSearch((search) => search.replaceAll())}
          >
            <ReplaceAllIcon />
          </FormButton>
        </div>
        <MatchSwitches options={options} size="glyph" class="mt-0.5 flex gap-px" />
        {line && (
          <p
            role="status"
            data-tone={tone}
            class="m-0 mt-2 text-[12px]/[1.5] text-muted data-[tone=error]:text-error"
          >
            {line}
          </p>
        )}
      </form>
      <div class="min-h-0 flex-1 overflow-y-auto border-t border-edge px-[14px] pt-1.5 pb-3 in-data-[layout=compact]:px-2.5">
        {summary && (
          <p
            data-find-summary
            class="m-0 mx-2 mb-1.5 text-[12px]/[1.5] text-muted"
          >
            {summary}
          </p>
        )}
        <UsesList
          groups={groups}
          current={position.current}
          onOpen={(use) => withSearch((search) => search.openUse(use))}
        />
      </div>
    </>
  );
}
