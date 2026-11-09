import {
  CloseIcon,
  DownIcon,
  ReplaceAllIcon,
  ReplaceIcon,
  TextField,
  UpIcon,
} from "@impower/impower-ui/components";
import { useEffect, useRef } from "preact/hooks";
import { showSnackbar } from "../../utils/snackbar";
import workspace from "../../workspace/WorkspaceStore";
import {
  countLabel,
  FormButton,
  MatchSwitches,
  onFindKeyDown,
  useFieldFocus,
} from "./findControls";
import { withSearch } from "./withSearch";

const FIELD =
  "flex min-h-11 min-w-0 items-center rounded-control border border-edge bg-bg focus-within-edge";

const INPUT =
  "min-h-0 flex-1 shrink border-0 bg-transparent text-[15px]/[1.4] focus-visible:outline-none";

export default function PhoneFindBar() {
  const snapshot = workspace.search.value;
  const position = workspace.searchPosition.value;
  const field = useRef<HTMLInputElement>(null);
  useFieldFocus(field, snapshot.focusRequest);

  const { term, total, error, status, options, replacement } = snapshot;
  useEffect(() => {
    if (status) {
      showSnackbar({ message: status });
    }
  }, [status]);

  const label = countLabel({
    term,
    total,
    error,
    index: position.index,
    scripts: position.scripts,
  });

  return (
    <form
      data-find-bar
      class="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-center gap-x-0.5 gap-y-1 border-t border-edge bg-panel px-2 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        withSearch((search) => search.step());
      }}
      onKeyDown={onFindKeyDown}
    >
      <div class={FIELD}>
        <TextField
          ref={field}
          width="full"
          class={INPUT}
          placeholder="Find"
          name="search"
          aria-label="Words to find"
          value={term}
          onValueChange={(value) => withSearch((search) => search.setTerm(value))}
        />
        <span
          role="status"
          data-find-summary
          data-tone={label.tone}
          title={label.title}
          class="flex-none px-1 text-[12px] whitespace-nowrap text-muted data-[tone=error]:text-error"
        >
          {label.text}
        </span>
        <MatchSwitches options={options} size="inset" class="flex flex-none" />
      </div>
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
      <FormButton
        name="close"
        label="Close search"
        onClick={() => withSearch((search) => search.close())}
      >
        <CloseIcon />
      </FormButton>
      <div class={FIELD}>
        <TextField
          width="full"
          class={INPUT}
          placeholder="Replace"
          name="replace"
          aria-label="Replace with"
          value={replacement}
          onValueChange={(value) =>
            withSearch((search) => search.setReplacement(value))
          }
        />
      </div>
      <FormButton
        name="replace"
        label="Replace this match"
        onClick={() => withSearch((search) => search.replaceOne())}
      >
        <ReplaceIcon />
      </FormButton>
      <FormButton
        name="replaceAll"
        label="Replace all matches"
        onClick={() => withSearch((search) => search.replaceAll())}
      >
        <ReplaceAllIcon />
      </FormButton>
    </form>
  );
}
