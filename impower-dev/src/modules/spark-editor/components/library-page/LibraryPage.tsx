import {
  Button,
  cn,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  PlusIcon,
  VirtualList,
  type VirtualListGrid,
} from "@impower/impower-ui/components";
import type { ComponentChildren, JSX, Ref, RefObject } from "preact";
import LibraryToolbar from "./LibraryToolbar";
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
  newLabel: string;
  newMenu: ComponentChildren;
  newAttributes?: Record<string, string>;
  newRef?: RefObject<HTMLButtonElement>;
  tabs?: ComponentChildren;
  bar: ComponentChildren;
  creating?: ComponentChildren;
  list: LibraryList<T> | null;
  empty?: ComponentChildren;
  area?: JSX.HTMLAttributes<HTMLDivElement>;
  overlay?: ComponentChildren;
  foot?: ComponentChildren;
  children?: ComponentChildren;
};

export default function LibraryPage<T>({
  searchLabel,
  query,
  onQueryChange,
  newLabel,
  newMenu,
  newAttributes,
  newRef,
  tabs,
  bar,
  creating,
  list,
  empty,
  area,
  overlay,
  foot,
  children,
}: LibraryPageProps<T>) {
  return (
    <div class="flex min-h-0 flex-1 flex-col" {...area}>
      <div class="@container flex min-h-0 flex-1 flex-col px-4 [:root[data-layout=desktop]_&]:px-[18px]">
        <div class="mx-auto flex min-h-0 w-full max-w-[960px] flex-1 flex-col">
          <LibraryToolbar>
            <SearchBox label={searchLabel} value={query} onChange={onQueryChange} />
            <DropdownRoot>
              <DropdownTrigger asChild>
                <Button ref={newRef} class="bg-transparent text-accent" {...newAttributes}>
                  <PlusIcon />
                  {newLabel}
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end" class="min-w-[196px]">
                {newMenu}
              </DropdownContent>
            </DropdownRoot>
          </LibraryToolbar>
          <div class="relative flex min-h-0 flex-1 flex-col">
            {tabs}
            <div class="flex min-h-[52px] flex-none items-center justify-between gap-2 border-b border-edge">
              {bar}
            </div>
            {creating && <div class="flex-none pt-2">{creating}</div>}
            {list && list.items.length ? (
              <VirtualList
                listRef={list.listRef}
                label={list.label}
                class={cn("-mr-4 flex-1 pt-2 pr-4 pb-5", list.grid && "pt-4")}
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
            {overlay}
          </div>
          {foot}
        </div>
      </div>
      {children}
    </div>
  );
}
