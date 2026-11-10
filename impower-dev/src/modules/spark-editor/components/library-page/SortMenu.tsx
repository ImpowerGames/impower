import {
  Button,
  ClockIcon,
  DropdownContent,
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
  "Other scripts' diverts, calls and character cues. Uses of a define's properties are not counted yet.";

const ALL_FIELDS = SORT_FIELDS.map((spec) => spec.field);

export type SortMenuProps = {
  value: string | undefined;
  fields?: readonly SortField[];
  onChange: (key: string) => void;
};

export default function SortMenu({ value, fields = ALL_FIELDS, onChange }: SortMenuProps) {
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
                {field.field === "uses" ? (
                  <span class="flex min-w-0 flex-col gap-0.5 py-1.5">
                    <span>{field.label}</span>
                    <small class="max-w-[200px] text-[11px]/[1.4] font-normal whitespace-normal text-muted">
                      {USES_HINT}
                    </small>
                  </span>
                ) : (
                  field.label
                )}
              </DropdownRadioItem>
            );
          })}
        </DropdownRadioGroup>
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
