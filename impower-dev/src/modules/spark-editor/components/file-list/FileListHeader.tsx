import {
  ArrowDown,
  ArrowUp,
  Button,
  Check,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  Filter,
  Search,
  X,
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
  const SortArrow = sortOrder === "asc" ? ArrowUp : ArrowDown;
  const filterActive = typeFilter !== "";

  return (
    <div class="flex min-w-0 flex-1 flex-col gap-4 mt-4">

      <div class="flex flex-row items-center gap-2">
        <div class="relative flex min-w-0 flex-1 items-center">
          <Search class="pointer-events-none absolute left-2 size-4 text-foreground/40" />
          <input
            value={search}
            onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
            placeholder="Search"
            aria-label="Search files"
            class="h-10 w-full rounded-md bg-foreground/5 pl-8 pr-7 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:bg-foreground/10"
          />
          {search && (
            <Button
              variant="ghost"
              aria-label="Clear search"
              onClick={() => onSearch("")}
              class="absolute right-1 size-6 rounded-full p-0 text-foreground/50 hover:text-foreground"
            >
              <X class="size-3.5" />
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
                variant="ghost"
                aria-label="Filter by type"
                class={`h-8 gap-4 rounded-md px-2 mx-1 text-sm font-normal ${
                  filterActive
                    ? "text-primary"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                <Filter class="size-4" />
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
                    {typeFilter === f.value && <Check class="size-4" />}
                  </span>
                  {f.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownRoot>

          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button
                variant="ghost"
                aria-label="Sort"
                class="h-8 gap-4 rounded-md px-2 mx-3 text-sm font-normal text-foreground/70 hover:text-foreground"
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
