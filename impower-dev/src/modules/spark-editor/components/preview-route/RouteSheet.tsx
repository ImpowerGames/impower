import { DialogTitle, Sheet } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import route from "../../workspace/route/RouteStore";
import RouteListView from "./RouteListView";

export default function RouteSheet() {
  const open = useComputed(
    () => route.sheetOpen.value && !!route.view.value,
  ).value;
  return (
    <Sheet
      open={open}
      flush
      onOpenChange={(next) => {
        if (!next) {
          route.close();
        }
      }}
    >
      <DialogTitle class="sr-only">Route</DialogTitle>
      <RouteListView class="min-h-0 flex-1 overflow-auto" />
    </Sheet>
  );
}
