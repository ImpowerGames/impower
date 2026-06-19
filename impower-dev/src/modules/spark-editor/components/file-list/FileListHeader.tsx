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

// Files are ALWAYS grouped by type (extension); the sort field only orders rows
// WITHIN each type group. So the sort options are the secondary keys.
export type SortKey = "name" | "modified" | "size";
export type SortOrder = "asc" | "desc";
/** "" = all types; otherwise the media category to keep. */
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
  /** Pick a sort field; the parent toggles asc↔desc when it's the active one. */
  onSort: (key: SortKey) => void;
  typeFilter: TypeFilter;
  onTypeFilter: (value: TypeFilter) => void;
};

/**
 * File-manager header (reimplemented from the legacy EngineConsoleHeader on our
 * preact/Tailwind/Radix stack): a search field, a Type filter menu (funnel icon,
 * tinted when active), and a Sort menu (field label + asc/desc arrow). Sort
 * applies to FILES only — folders always sort first by name.
 */
export default function FileListHeader({
  search,
  onSearch,
  sortKey,
  sortOrder,
  onSort,
  typeFilter,
  onTypeFilter,
}: FileListHeaderProps) {
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Name";
  const SortArrow = sortOrder === "asc" ? ArrowUp : ArrowDown;
  const filterActive = typeFilter !== "";

  return (
    <div class="flex min-w-0 flex-1 flex-row items-center gap-1">
      {/* Search by name (matches keep their ancestor folders). */}
      <div class="relative flex min-w-0 flex-1 items-center">
        <Search class="pointer-events-none absolute left-2 size-4 text-foreground/40" />
        <input
          value={search}
          onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
          placeholder="Search"
          aria-label="Search files"
          class="h-8 w-full rounded-md bg-foreground/5 pl-8 pr-7 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:bg-foreground/10"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearch("")}
            class="absolute right-1 flex size-6 items-center justify-center rounded-full text-foreground/50 hover:text-foreground"
          >
            <X class="size-3.5" />
          </button>
        )}
      </div>

      {/* Type filter. */}
      <DropdownRoot>
        <DropdownTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Filter by type"
            class={`rounded-full ${
              filterActive ? "text-primary" : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Filter class="size-5" />
          </Button>
        </DropdownTrigger>
        <DropdownContent align="end" sideOffset={4}>
          {TYPE_FILTERS.map((f) => (
            <DropdownItem key={f.value} onSelect={() => onTypeFilter(f.value)}>
              <span class="flex size-4 items-center justify-center">
                {typeFilter === f.value && <Check class="size-4" />}
              </span>
              {f.label}
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownRoot>

      {/* Sort field + direction. */}
      <DropdownRoot>
        <DropdownTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Sort"
            class="h-8 gap-1 rounded-md px-2 text-sm font-normal text-foreground/70 hover:text-foreground"
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
  );
}
