import {
  ArrowLeft,
  BrandVscode,
  Button,
  ExternalLink,
  Menu,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import Account from "../account/Account";

export const propDefaults = {};
export type HeaderMenuButtonProps = Partial<typeof propDefaults>;

// workaround(vite): @radix-ui/react-dialog's CJS portal helpers crash Vite SSR module load, so the drawer is a Preact-native modal
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
              class={`flex h-full w-[300px] flex-col bg-engine-800 shadow-xl transition-transform duration-[225ms] ease-out ${
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
                <div class="flex-1 px-2 text-lg font-medium text-foreground">
                  Spark Engine
                </div>
                <div class="mr-4 size-6">
                  <SparkLogo />
                </div>
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

function SparkLogo() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2"
    >
      <g transform="matrix(1.091742,0,0,1.091742,-11.190351,-11.190351)">
        <path
          d="M10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1Z"
          fill="rgb(255,63,119)"
        />
      </g>
      <g transform="matrix(-1.091742,0,0,-1.091742,43.190351,43.190351)">
        <path
          d="M22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3Z"
          fill="rgb(19,189,254)"
        />
      </g>
      <g transform="matrix(0,-1.091742,1.091742,0,-11.190351,43.190351)">
        <path
          d="M22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3Z"
          fill="rgb(2,208,132)"
        />
      </g>
      <g transform="matrix(0,1.091742,-1.091742,0,43.190351,-11.190351)">
        <path
          d="M22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3Z"
          fill="rgb(250,153,0)"
        />
      </g>
    </svg>
  );
}
