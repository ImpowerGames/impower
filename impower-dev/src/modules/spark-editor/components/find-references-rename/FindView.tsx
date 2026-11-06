import {
  Button,
  DownIcon,
  ReplaceAllIcon,
  ReplaceIcon,
  TextField,
  UpIcon,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { count } from "../../workspace/WorkspaceSearch";
import type { FindOption } from "../../workspace/searchState";
import workspace from "../../workspace/WorkspaceStore";
import UsesList from "./UsesList";
import { withSearch } from "./withSearch";

const OPTIONS: { option: FindOption; label: string; icon: ComponentChildren }[] = [
  { option: "matchCase", label: "Match case", icon: "Aa" },
  { option: "wholeWord", label: "Whole words", icon: <u>ab</u> },
  { option: "regex", label: "Regular expression", icon: ".*" },
];

const keepFieldFocus = (event: PointerEvent) => event.preventDefault();

function FormButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <Button
      variant="quiet"
      size="glyph"
      class="text-muted"
      aria-label={label}
      title={title ?? label}
      onPointerDown={keepFieldFocus}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export default function FindView() {
  const snapshot = workspace.search.value;
  const position = workspace.searchPosition.value;
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const backward = event.shiftKey;
      withSearch((search) => search.step(backward));
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      withSearch((search) => search.close());
    }
  };

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
        onKeyDown={onKeyDown}
      >
        <div class="flex items-center gap-0.5">
          <TextField
            ref={field}
            width="full"
            class="flex-1"
            placeholder="Find"
            aria-label="Words to find"
            value={term}
            onValueChange={(value) => withSearch((search) => search.setTerm(value))}
          />
          <FormButton
            label="Previous match"
            title="Previous match (Shift Enter)"
            onClick={() => withSearch((search) => search.step(true))}
          >
            <UpIcon />
          </FormButton>
          <FormButton
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
            placeholder="Replace"
            aria-label="Replace with"
            value={snapshot.replacement}
            onValueChange={(value) =>
              withSearch((search) => search.setReplacement(value))
            }
          />
          <FormButton
            label="Replace this match"
            onClick={() => withSearch((search) => search.replaceOne())}
          >
            <ReplaceIcon />
          </FormButton>
          <FormButton
            label="Replace all matches"
            onClick={() => withSearch((search) => search.replaceAll())}
          >
            <ReplaceAllIcon />
          </FormButton>
        </div>
        <div role="group" aria-label="How to match" class="mt-0.5 flex gap-px">
          {OPTIONS.map(({ option, label, icon }) => (
            <Button
              key={option}
              variant="toggle"
              size="glyph"
              aria-label={label}
              title={label}
              aria-pressed={options[option]}
              onPointerDown={keepFieldFocus}
              onClick={() => withSearch((search) => search.toggleOption(option))}
            >
              {icon}
            </Button>
          ))}
        </div>
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
          <p class="m-0 mx-2 mb-1.5 text-[12px]/[1.5] text-muted">{summary}</p>
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
