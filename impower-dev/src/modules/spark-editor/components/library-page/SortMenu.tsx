import {
  Button,
  ClockIcon,
  DropdownContent,
  DropdownItemText,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  SizeIcon,
  SortIcon,
  SortReverseIcon,
  StoryIcon,
  UsesIcon,
} from "@impower/impower-ui/components";
import {
  SORT_FIELDS,
  sortLabel,
  sortMenu,
  type SortField,
  type SortIcon as SortIconName,
} from "../../utils/fileListModel";

const FIELD_ICONS: Record<SortIconName, typeof SortIcon> = {
  sort: SortIcon,
  clock: ClockIcon,
  size: SizeIcon,
  uses: UsesIcon,
  story: StoryIcon,
};

const USES_HINT =
  "Other scripts' diverts, calls, character cues and uses of its defines.";

const ALL_FIELDS = SORT_FIELDS.map((spec) => spec.field);

export type SortMenuProps = {
  value: string | undefined;
  fields?: readonly SortField[];
  usesHint?: string;
  note?: string;
  onChange: (key: string) => void;
};

export default function SortMenu({ value, fields = ALL_FIELDS, usesHint = USES_HINT, note, onChange }: SortMenuProps) {
  const label = sortLabel(value);
  const menu = sortMenu(value);
  const fieldKey = menu.fields.find((f) => f.checked)!.key;
  const directionKey = menu.directions.find((d) => d.checked)!.key;
  const DirectionIcon = label.direction === "asc" ? SortIcon : SortReverseIcon;
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="compact"
          aria-label={`Sort by ${label.description}`}
          class="text-muted @max-[440px]:[&>span]:hidden"
        >
          <DirectionIcon />
          <span>{label.name}</span>
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        <DropdownLabel variant="heading">Sort by</DropdownLabel>
        <DropdownRadioGroup label="Sort by" value={fieldKey} onValueChange={onChange}>
          {menu.fields.filter((field) => fields.includes(field.field)).map((field) => {
            const Icon = FIELD_ICONS[field.icon];
            return (
              <DropdownRadioItem key={field.field} value={field.key} indicator="end">
                <Icon class="text-muted" />
                <DropdownItemText hint={field.field === "uses" ? usesHint : undefined}>{field.label}</DropdownItemText>
              </DropdownRadioItem>
            );
          })}
        </DropdownRadioGroup>
        {note && (
          <p role="status" class="m-0 px-3 pb-1.5 text-[11px]/[1.4] text-muted" data-sort-note>
            {note}
          </p>
        )}
        <DropdownSeparator />
        <DropdownLabel variant="heading">Order</DropdownLabel>
        <DropdownRadioGroup label="Order" value={directionKey} onValueChange={onChange}>
          {menu.directions.map((direction) => {
            const Icon = direction.direction === "asc" ? SortIcon : SortReverseIcon;
            return (
              <DropdownRadioItem key={direction.direction} value={direction.key} indicator="end">
                <Icon class="text-muted" />
                {direction.label}
              </DropdownRadioItem>
            );
          })}
        </DropdownRadioGroup>
      </DropdownContent>
    </DropdownRoot>
  );
}
