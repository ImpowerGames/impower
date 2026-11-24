import { cn } from "@impower/impower-ui/components";

export const TOOLBAR_BUTTON_CLASS =
  "flex h-full cursor-pointer flex-row items-center border-none bg-transparent px-(--swp-toolbar-button-gap) py-0 text-inherit active:bg-(--swp-toolbar-button-active-color) aria-expanded:bg-(--swp-toolbar-button-active-color) pointer-fine:hover:not-active:not-aria-expanded:bg-(--swp-toolbar-button-hover-color)";

export const STATUS_COLOURS: Partial<Record<string, string>> = {
  warning: "text-warning",
  error: "text-error",
};

export const VALUES_PANEL_CLASS =
  "sv-tab flex flex-col gap-1 px-(--swp-toolbar-button-gap) pt-1 pb-1.5";

export const VALUE_FIELD_CLASS =
  "sv-field relative flex min-w-0 flex-row items-center";

export const VALUE_SLOT_CLASS =
  "sv-slot absolute top-0 right-[3px] bottom-0 flex w-[18px] items-center justify-center";

const VALUE_BOX_CLASS =
  "box-border h-[22px] min-w-0 rounded-[3px] border border-solid border-(color:--swp-route-field-border-color) bg-(--swp-route-field-background-color) px-1.5 py-0 text-inherit outline-none focus:border-accent";

export const VALUE_SEARCH_CLASS = `sv-search ${VALUE_BOX_CLASS}`;

export const valueInputClass = ({
  status,
  set,
  unset,
}: {
  status?: string;
  set?: boolean;
  unset?: boolean;
}) =>
  cn(
    "sv-input",
    VALUE_BOX_CLASS,
    "w-full flex-1 pr-6 font-[family-name:monospace] placeholder:text-muted placeholder:opacity-100",
    unset && "unset placeholder:text-warning",
    set &&
      "border-[color-mix(in_srgb,var(--accent)_55%,var(--swp-route-field-border-color))] focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--swp-route-field-border-color))]",
    status === "warning" && "border-warning focus:border-warning",
    status === "error" && "border-error focus:border-error",
  );

export const valueBadgeClass = (status?: string) =>
  cn(
    "sv-badge relative flex cursor-default border-none bg-transparent p-0 text-inherit outline-none focus-visible:rounded-[3px] focus-visible:shadow-[0_0_0_1px_var(--accent)] focus-visible:outline-none",
    status && STATUS_COLOURS[status],
  );

export const VALUE_ROW_SET_CLASS =
  "before:absolute before:top-1 before:bottom-1 before:left-0 before:w-[3px] before:rounded-[2px] before:bg-accent";

export const VALUE_GROUP_HEAD_CLASS =
  "sv-group-head mx-0 mt-1 mb-0 flex flex-row gap-1.5 [font-size:inherit] font-semibold tracking-[0.04em] uppercase";

export const VALUES_STATUS_CLASS =
  "sv-status flex h-5 flex-row items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap leading-5 text-muted";

export const VALUES_FOOT_CLASS =
  "sv-foot flex flex-row justify-end border-t border-solid border-edge pt-1";

export const VALUES_ACTION_CLASS =
  "cursor-pointer rounded-[3px] border-none bg-transparent px-1.5 py-0.5 text-accent font-semibold disabled:cursor-default disabled:text-muted";

export function ValueName({
  name,
  line,
  field,
  unresolved,
}: {
  name: string;
  line?: number | string;
  field?: boolean;
  unresolved?: boolean;
}) {
  return (
    <span
      class={cn(
        "sv-name flex min-w-0 flex-row whitespace-nowrap font-[family-name:monospace]",
        field && "pl-3",
      )}
      title={name}
    >
      <span
        class={cn(
          "sv-name-text min-w-0 overflow-hidden text-ellipsis",
          unresolved && "text-muted line-through",
        )}
      >
        {name}
      </span>
      {line !== undefined ? (
        <span class="sv-line ml-[0.6em] flex-none text-muted">{`· ${line}`}</span>
      ) : null}
    </span>
  );
}
