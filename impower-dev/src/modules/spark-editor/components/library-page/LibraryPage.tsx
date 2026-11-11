import {
  Button,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  PlusIcon,
  VirtualList,
  type VirtualListGrid,
} from "@impower/impower-ui/components";
import type { ComponentChildren, JSX, Ref } from "preact";
import SearchBox from "./SearchBox";

export type LibraryList<T> = {
  label: string;
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ComponentChildren;
  itemHeight?: (item: T, index: number) => number;
  grid?: VirtualListGrid;
  listRef?: Ref<HTMLDivElement>;
  revealIndex?: number;
  revealRequest?: number;
};

export type LibraryPageProps<T> = {
  searchLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  newMenu: ComponentChildren;
  newAttributes?: Record<string, string>;
  tabs?: ComponentChildren;
  bar: ComponentChildren;
  creating?: ComponentChildren;
  list: LibraryList<T> | null;
  empty?: ComponentChildren;
  area?: JSX.HTMLAttributes<HTMLDivElement>;
  children?: ComponentChildren;
};

export default function LibraryPage<T>({
  searchLabel,
  query,
  onQueryChange,
  newMenu,
  newAttributes,
  tabs,
  bar,
  creating,
  list,
  empty,
  area,
  children,
}: LibraryPageProps<T>) {
  return (
    <div class="flex min-h-0 flex-1 flex-col" {...area}>
      <div class="@container flex min-h-0 flex-1 flex-col px-4 [:root[data-layout=desktop]_&]:px-[18px]">
        <div class="mx-auto flex min-h-0 w-full max-w-[960px] flex-1 flex-col">
          <div class="flex flex-none items-center gap-2.5 pt-4 pb-2 [:root[data-layout=desktop]_&]:pb-3">
            <SearchBox label={searchLabel} value={query} onChange={onQueryChange} />
            <DropdownRoot>
              <DropdownTrigger asChild>
                <Button class="bg-transparent text-accent" {...newAttributes}>
                  <PlusIcon />
                  New
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end" class="min-w-[196px]">
                {newMenu}
              </DropdownContent>
            </DropdownRoot>
          </div>
          {tabs}
          <div class="flex min-h-[52px] flex-none items-center justify-between gap-2 border-b border-edge">
            {bar}
          </div>
          {creating && <div class="flex-none pt-2">{creating}</div>}
          {list && list.items.length ? (
            <VirtualList
              listRef={list.listRef}
              label={list.label}
              class="-mr-4 flex-1 pt-2 pr-4 pb-5"
              items={list.items}
              getKey={list.getKey}
              renderItem={list.renderItem}
              itemHeight={list.itemHeight}
              grid={list.grid}
              revealIndex={list.revealIndex}
              revealRequest={list.revealRequest}
            />
          ) : (
            empty
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
