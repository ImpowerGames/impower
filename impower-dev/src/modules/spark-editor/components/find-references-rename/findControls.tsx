import { Button } from "@impower/impower-ui/components";
import type { ButtonSize } from "@impower/impower-ui/components";
import type { ComponentChildren, RefObject } from "preact";
import { useEffect } from "preact/hooks";
import { count } from "../../workspace/WorkspaceSearch";
import type { FindOption, FindOptions } from "../../workspace/searchState";
import { withSearch } from "./withSearch";

const OPTIONS: {
  option: FindOption;
  name: string;
  label: string;
  icon: ComponentChildren;
}[] = [
  { option: "matchCase", name: "case", label: "Match case", icon: "Aa" },
  { option: "wholeWord", name: "word", label: "Whole words", icon: <u>ab</u> },
  { option: "regex", name: "re", label: "Regular expression", icon: ".*" },
];

export const keepFieldFocus = (event: MouseEvent) => event.preventDefault();

export function FormButton({
  name,
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  name: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <Button
      variant="quiet"
      size="glyph"
      class="text-muted"
      name={name}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onMouseDown={keepFieldFocus}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function MatchSwitches({
  options,
  size,
  class: className,
}: {
  options: FindOptions;
  size: ButtonSize;
  class?: string;
}) {
  return (
    <div role="group" aria-label="How to match" class={className}>
      {OPTIONS.map(({ option, name, label, icon }) => (
        <Button
          key={option}
          name={name}
          variant="toggle"
          size={size}
          aria-label={label}
          title={label}
          aria-pressed={options[option]}
          onMouseDown={keepFieldFocus}
          onClick={() => withSearch((search) => search.toggleOption(option))}
        >
          {icon}
        </Button>
      ))}
    </div>
  );
}

export const onFindKeyDown = (event: KeyboardEvent) => {
  if (
    event.key === "Enter" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    const backward = event.shiftKey;
    withSearch((search) => search.step(backward));
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    withSearch((search) => search.close());
  }
};

export const useFieldFocus = (
  field: RefObject<HTMLInputElement>,
  focusRequest: number,
) => {
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }, [focusRequest]);
};

export const countLabel = ({
  term,
  total,
  error,
  index,
  scripts,
}: {
  term: string;
  total: number;
  error?: string;
  index: number;
  scripts: number;
}): { text: string; title?: string; tone: "info" | "error" } => {
  if (!term) {
    return { text: "", tone: "info" };
  }
  if (error) {
    return { text: "Invalid", title: error, tone: "error" };
  }
  if (!total) {
    return { text: "No matches", tone: "info" };
  }
  const text = `${index} of ${total}`;
  return { text, title: `${text} in ${count(scripts, "script")}`, tone: "info" };
};
