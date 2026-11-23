import { cn } from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import ProjectNameField from "./ProjectNameField";

const BANDS = {
  always: { name: "h-[45px] items-end", status: "h-11" },
  coarse: {
    name: "pointer-coarse:h-[45px] pointer-coarse:items-end",
    status: "pointer-coarse:h-11",
  },
} as const;

export default function TitleBarNameStatus({
  bands,
  class: className,
  statusClass,
  children,
}: {
  bands: keyof typeof BANDS;
  class?: string;
  statusClass?: string;
  children: ComponentChildren;
}) {
  return (
    <div class={cn("flex min-w-0 flex-col items-start", className)}>
      <div class={cn("flex w-full", BANDS[bands].name)}>
        <ProjectNameField />
      </div>
      <div class={cn("w-full min-w-0", BANDS[bands].status)}>
        <div class={cn("z-[2] flex items-center", statusClass)}>{children}</div>
      </div>
    </div>
  );
}
