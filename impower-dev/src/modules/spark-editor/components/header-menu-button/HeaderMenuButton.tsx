import {
  ArrowLeft,
  BrandVscode,
  Button,
  ExternalLink,
  SparkLogo,
  Menu,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import Account from "../account/Account";

export const propDefaults = {};
export type HeaderMenuButtonProps = Partial<typeof propDefaults>;

// workaround(vite): @radix-ui/react-dialog's CJS portal helpers crash Vite SSR module load, so the drawer is a Preact-native modal (seen with vite 8.0.16 and @radix-ui/react-dialog 1.1.17)
export default function HeaderMenuButton(_p: HeaderMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const pickingResource = useComputed(
    () => !!workspace.state.value.screen?.pickingResource,
  ).value;

  useEffect(() => {
    if (pickingResource && open) setOpen(false);
  }, [pickingResource, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        class="size-14 text-foreground"
        aria-label="Open Menu"
        disabled={pickingResource}
        onClick={() => setOpen(true)}
      >
        <Menu class="size-5" />
      </Button>

      {typeof document !== "undefined" &&
        createPortal(
          <div
            class={`fixed inset-0 bg-black/50 transition-opacity duration-200 ${
              open ? "" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={open ? undefined : true}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            style={{
              zIndex: 400,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              class={`flex h-full w-[300px] flex-col bg-elevated shadow-xl transition-transform duration-[225ms] ease-out ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
            >

              <div class="flex h-14 flex-none flex-row items-center">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  class="size-14 text-foreground"
                  aria-label="Close Menu"
                  onClick={() => setOpen(false)}
                >
                  <ArrowLeft class="size-5" />
                </Button>
                <SparkLogo class="ml-2" />
              </div>
              <div class="h-px bg-foreground/[0.12]" />

              <div class="flex flex-1 flex-col">
                <Account />
              </div>

              <div class="h-px bg-foreground/[0.12]" />
              <a
                href="https://marketplace.visualstudio.com/items?itemName=impowergames.vscode-sparkdown"
                target="_blank"
                rel="noopener noreferrer"
                class="flex flex-none flex-row items-center gap-6 px-6 py-3 text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <BrandVscode class="size-5 flex-none" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm font-medium">
                    Want to edit files locally?
                  </span>
                  <span class="truncate text-xs text-foreground/50">
                    Open your project in VS Code
                  </span>
                </span>
                <ExternalLink class="size-4 flex-none opacity-50" />
              </a>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
