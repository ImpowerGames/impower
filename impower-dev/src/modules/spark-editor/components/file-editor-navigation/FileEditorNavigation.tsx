import { ArrowLeft, Button } from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";

export const propDefaults = {};
export type FileEditorNavigationProps = Partial<typeof propDefaults> & {
  onBack?: () => void;
  children?: ComponentChildren;
};

export default function FileEditorNavigation({
  onBack,
  children,
}: FileEditorNavigationProps) {
  return (
    <>
      <div class="sticky top-0 z-10 bg-engine-900">
        <div class="relative flex h-12 flex-row items-stretch">
          <Button
            variant="ghost"
            size="icon-lg"
            class="text-foreground/50"
            aria-label="Back"
            onClick={() => onBack?.()}
          >
            <ArrowLeft class="size-5" />
          </Button>

          <div class="relative flex flex-1 flex-row items-center justify-center px-4 text-base">
            <div class="absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap text-center">
              {children}
            </div>
          </div>

          <div class="w-14 flex-none" />
        </div>
      </div>
    </>
  );
}
