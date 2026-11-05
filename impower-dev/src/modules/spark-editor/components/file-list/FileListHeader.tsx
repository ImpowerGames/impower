import {
  Button,
  CheckIcon,
  CloseIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  FilterIcon,
  SearchIcon,
  SortIcon,
  SortReverseIcon,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";

export type SortKey = "name" | "modified" | "size";
export type SortOrder = "asc" | "desc";
export type TypeFilter = "" | "image" | "audio" | "video" | "text";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "modified", label: "Modified" },
  { key: "size", label: "Size" },
];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "", label: "All Types" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "text", label: "Text" },
];

export type FileListHeaderProps = {
  search: string;
  onSearch: (query: string) => void;
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
  typeFilter: TypeFilter;
  onTypeFilter: (value: TypeFilter) => void;
  trailing?: ComponentChildren;
  selectionRow?: ComponentChildren;
};

export default function FileListHeader({
  search,
  onSearch,
  sortKey,
  sortOrder,
  onSort,
  typeFilter,
  onTypeFilter,
  trailing,
  selectionRow,
}: FileListHeaderProps) {
  const sortLabel =
    SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Name";
  const SortArrow = sortOrder === "asc" ? SortReverseIcon : SortIcon;
  const filterActive = typeFilter !== "";

  return (
    <div class="flex min-w-0 flex-1 flex-col gap-4 mt-4">

      <div class="flex flex-row items-center gap-2">
        <div class="relative flex min-w-0 flex-1 items-center">
          <SearchIcon class="pointer-events-none absolute left-2.5 size-4 text-muted" />
          <input
            value={search}
            onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
            placeholder="Search"
            aria-label="Search files"
            class="h-11 w-full rounded-control border border-edge bg-transparent pl-8 pr-11 text-sm text-ink placeholder:text-muted"
          />
          {search && (
            <Button
              variant="quiet"
              aria-label="Clear search"
              onClick={() => onSearch("")}
              size="icon"
              class="absolute right-0 text-muted"
            >
              <CloseIcon class="size-3.5" />
            </Button>
          )}
        </div>
        {trailing}
      </div>


      {selectionRow ?? (
        <div class="flex flex-row items-center justify-between">
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button
                variant="quiet"
                aria-label="Filter by type"
                class={filterActive ? "mx-1 text-accent" : "mx-1 text-muted"}
              >
                <FilterIcon class="size-4" />
                {filterActive
                  ? (TYPE_FILTERS.find((f) => f.value === typeFilter)?.label ??
                    "Filter")
                  : "Filter"}
              </Button>
            </DropdownTrigger>
            <DropdownContent align="start" sideOffset={4}>
              {TYPE_FILTERS.map((f) => (
                <DropdownItem
                  key={f.value}
                  onSelect={() => onTypeFilter(f.value)}
                >
                  <span class="flex size-4 items-center justify-center">
                    {typeFilter === f.value && <CheckIcon class="size-4" />}
                  </span>
                  {f.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownRoot>

          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button
                variant="quiet"
                aria-label="Sort"
                class="mx-3 text-muted"
              >
                {sortLabel}
                <SortArrow class="size-4" />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end" sideOffset={4}>
              {SORT_OPTIONS.map((o) => (
                <DropdownItem key={o.key} onSelect={() => onSort(o.key)}>
                  <span class="flex size-4 items-center justify-center">
                    {sortKey === o.key && <SortArrow class="size-4" />}
                  </span>
                  {o.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownRoot>
        </div>
      )}
    </div>
  );
}
