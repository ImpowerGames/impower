import {
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownSeparator,
  type DropdownItemInset,
  cn,
} from "@impower/impower-ui/components";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import type { PreviewMode } from "../../workspace/settings/settingsSchema";
import { ASPECT_RATIO_ROWS, PAGE_FILLS_PANE, sizeControl } from "./barState";

export function AspectRatioGroup({
  disabled,
  inset,
  itemClass,
}: {
  disabled?: boolean;
  inset?: DropdownItemInset;
  itemClass?: string;
}) {
  const choice = workspaceSettings.projectSettings.value.previewAspectRatio;
  const onValueChange = (value: string) => {
    const row = ASPECT_RATIO_ROWS.find((r) => r.value === value);
    if (row) {
      workspaceSettings.setProjectSetting("previewAspectRatio", row.value);
    }
  };
  return (
    <DropdownRadioGroup
      label="Game aspect ratio"
      value={disabled ? "auto" : choice}
      onValueChange={onValueChange}
    >
      {ASPECT_RATIO_ROWS.map(({ value, name, hint }) => (
        <DropdownRadioItem
          key={value}
          value={value}
          disabled={disabled}
          inset={inset}
          class={cn("gap-2.5", itemClass)}
        >
          <span class="w-[3.6em] tabular-nums group-data-[state=checked]:text-accent">
            {name}
          </span>
          <small class="text-[11px] font-normal text-muted">{hint}</small>
        </DropdownRadioItem>
      ))}
    </DropdownRadioGroup>
  );
}

export function AspectRatioSettings({
  mode,
  inset,
  itemClass,
}: {
  mode: PreviewMode;
  inset?: DropdownItemInset;
  itemClass?: string;
}) {
  const size = sizeControl(mode);
  if (size === "paper") {
    return null;
  }
  return (
    <>
      <DropdownSeparator />
      <DropdownLabel variant="heading" inset={inset}>
        Game aspect ratio
      </DropdownLabel>
      {size === "pageFillsPane" ? (
        <DropdownLabel inset={inset} class="pt-0 text-xs/[1.5] text-muted">
          {PAGE_FILLS_PANE}
        </DropdownLabel>
      ) : null}
      <AspectRatioGroup
        disabled={size === "pageFillsPane"}
        inset={inset}
        itemClass={itemClass}
      />
    </>
  );
}
