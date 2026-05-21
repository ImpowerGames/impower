import {
  BrandGoogleDrive,
  Download,
  Logout,
  Ripple,
  Upload,
} from "@impower/impower-ui/components";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { downloadFile } from "../../utils/downloadFile";
import type { AccountInfo } from "../../workspace/types/AccountInfo";

export const propDefaults = {};
export type AccountProps = Partial<typeof propDefaults>;

/**
 * Side-drawer account panel. Two layouts:
 *
 *   - **Unauthenticated**: Import Project (file input), Export Project,
 *     then a "Sync With Google Drive" call-to-action pinned to the bottom.
 *     If the user previously signed in but revoked consent, the bottom
 *     CTA flips to "Grant Access To Google Drive".
 *
 *   - **Authenticated**: Load Remote Project + Save Remote Project as
 *     elevated `fab-bg` buttons up top, then the user's name/email row
 *     pinned to the bottom; clicking that row opens a Radix dropdown
 *     with a Sign Out item.
 *
 * On mount the panel fetches the current Google account (if any) and
 * also kicks off the workspace's project load — that's what flips the
 * top-of-page sync status from skeleton to "Saved in cache". Subscribes
 * to the sync provider's `"revoke"` event so an externally-revoked
 * grant immediately swaps the UI back to unauthenticated.
 */
export default function Account(_p: AccountProps) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [signinLabel, setSigninLabel] = useState("Sync With Google Drive");
  const [signoutOpen, setSignoutOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const accountRowRef = useRef<HTMLDivElement | null>(null);

  // Close signout popup on outside click or Escape.
  useEffect(() => {
    if (!signoutOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        accountRowRef.current &&
        !accountRowRef.current.contains(e.target as Node)
      ) {
        setSignoutOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSignoutOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [signoutOpen]);

  useEffect(() => {
    let cancelled = false;
    let detachRevoke: (() => void) | undefined;
    (async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      try {
        const provider = Workspace.sync.google;
        const info = await provider.getCurrentAccount();
        if (cancelled) return;
        applyAccountInfo(info);
        const onRevoke = () => {
          if (cancelled) return;
          setAccount(null);
          setSigninLabel("Sync With Google Drive");
        };
        provider.addEventListener("revoke", onRevoke);
        detachRevoke = () =>
          provider.removeEventListener("revoke", onRevoke);
      } catch (err) {
        console.error(err);
      }
      try {
        await Workspace.window.loadProject();
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
      detachRevoke?.();
    };
  }, []);

  const applyAccountInfo = (info: AccountInfo | null) => {
    if (!info || !info.uid) {
      setAccount(null);
      setSigninLabel("Sync With Google Drive");
    } else if (!info.consented) {
      setAccount(null);
      setSigninLabel("Grant Access To Google Drive");
    } else {
      setAccount(info);
    }
  };

  const handleImportProjectChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const buffer = await file.arrayBuffer();
    await Workspace.window.importLocalProject(file.name, buffer);
    target.value = "";
  };

  const handleExportProject = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    const zip = await Workspace.window.exportLocalProject();
    if (zip) {
      const name = Workspace.window.store.project.name;
      downloadFile(`${name}.zip`, "application/x-zip", zip);
    }
  };

  const handleSignIn = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    try {
      const provider = Workspace.sync.google;
      const info = await provider.signIn();
      applyAccountInfo(info);
    } catch (err) {
      console.error(err);
      setAccount(null);
      setSigninLabel("Sync With Google Drive");
    }
  };

  const handleSignOut = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    const { WorkspaceConstants } = await import(
      "../../workspace/WorkspaceConstants"
    );
    try {
      const provider = Workspace.sync.google;
      Workspace.window.unloadProject();
      await provider.signOut();
      Workspace.window.loadNewProject(WorkspaceConstants.LOCAL_PROJECT_ID);
      setAccount(null);
      setSigninLabel("Sync With Google Drive");
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadRemoteProject = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    try {
      const provider = Workspace.sync.google;
      const access = await provider.getAccess();
      const token = access?.token;
      if (!token) return;
      Workspace.window.startedPickingRemoteProjectResource();
      const fileId = await provider.pickRemoteProjectFile(token);
      if (fileId) {
        Workspace.window.unloadProject();
        Workspace.window.loadNewProject(fileId);
      }
      Workspace.window.finishedPickingRemoteProjectResource();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveRemoteProject = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    try {
      const projectId = Workspace.window.store?.project?.id;
      if (!projectId) return;
      const provider = Workspace.sync.google;
      const access = await provider.getAccess();
      const token = access?.token;
      if (!token) return;
      Workspace.window.startedPickingRemoteProjectResource();
      const folderId = await provider.pickRemoteProjectFolder(token);
      if (folderId) {
        await Workspace.window.saveRemoteProject(folderId);
      }
      Workspace.window.finishedPickingRemoteProjectResource();
    } catch (err) {
      console.error(err);
    }
  };

  const offline = account?.offline;

  return (
    <div class="flex flex-1 flex-col">
      {account ? (
        <>
          {/* Authenticated: elevated fab-bg buttons up top. */}
          <FabRow
            icon={<Download class="size-5" />}
            onClick={handleLoadRemoteProject}
          >
            Load Remote Project
          </FabRow>
          <FabRow
            icon={<Upload class="size-5" />}
            onClick={handleSaveRemoteProject}
          >
            Save Remote Project
          </FabRow>
          <div class="flex-1" />
          {/* Account row + popup. Preact-native (not Radix) per memory:
              feedback_radix_dialog_breaks_ssr — Radix portal helpers
              trip Vite's CJS interop during SSR module load. */}
          <div ref={accountRowRef} class="relative">
            <button
              type="button"
              onClick={() => setSignoutOpen((v) => !v)}
              class="relative flex w-full cursor-pointer flex-row items-center gap-6 overflow-hidden bg-[var(--theme-color-fab-bg)] px-6 py-4 text-left text-[var(--theme-color-fab-fg)] outline-none m-px shadow before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12]"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                {account.displayName ? (
                  <div class="truncate text-base font-semibold text-[var(--theme-color-fab-fg)]">
                    {account.displayName}
                  </div>
                ) : null}
                {account.email ? (
                  <div class="truncate text-sm font-normal text-[var(--theme-color-fab-fg)] opacity-70">
                    {account.email}
                  </div>
                ) : null}
              </div>
              <Ripple />
            </button>
            {signoutOpen ? (
              <div
                role="menu"
                class="absolute inset-x-0 top-full mt-1 overflow-hidden rounded-lg py-2 shadow-lg"
                style={{ backgroundColor: "var(--theme-color-popup)" }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSignoutOpen(false);
                    handleSignOut();
                  }}
                  class="relative flex h-10 w-full cursor-pointer flex-row items-center gap-2 overflow-hidden bg-transparent px-5 text-left text-sm text-foreground/70 outline-none hover:bg-foreground/5 active:bg-foreground/[0.12]"
                >
                  <Logout class="size-5" />
                  <span>Sign Out</span>
                  <Ripple />
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {/* Hidden file input for Import Project. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            class="hidden"
            onChange={handleImportProjectChange}
          />
          <Row
            icon={<Download class="size-5" />}
            onClick={() => fileInputRef.current?.click()}
            disabled={offline}
          >
            Import Project
          </Row>
          <Row
            icon={<Upload class="size-5" />}
            onClick={handleExportProject}
            disabled={offline}
          >
            Export Project
          </Row>
          <div class="flex-1" />
          <Row
            icon={<BrandGoogleDrive class="size-5" />}
            onClick={handleSignIn}
          >
            {signinLabel}
          </Row>
        </>
      )}
    </div>
  );
}

/** Transparent-bg row with hover/press overlay. Matches sparkle's
 *  `<s-button color="transparent" text-color="fab-fg" p="16 24" spacing="24"
 *  size="lg" width="100%">` — also resolves the previous regression where
 *  Import Project had no hover state. */
function Row({
  icon,
  onClick,
  disabled,
  children,
}: {
  icon: ComponentChildren;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      class="relative flex w-full cursor-pointer flex-row items-center gap-6 overflow-hidden bg-transparent px-6 py-4 text-left text-[var(--theme-color-fab-fg)] font-medium outline-none transition-colors duration-150 hover:bg-foreground/5 active:bg-foreground/[0.12] disabled:pointer-events-none disabled:opacity-50"
    >
      {icon}
      <span class="flex-1 truncate">{children}</span>
      <Ripple />
    </button>
  );
}

/** Elevated `fab-bg` row used for the authenticated CTAs. Replaces the
 *  legacy `<s-button bg-color="fab-bg" shadow="1">`. */
function FabRow({
  icon,
  onClick,
  children,
}: {
  icon: ComponentChildren;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="relative flex w-full cursor-pointer flex-row items-center gap-6 overflow-hidden bg-[var(--theme-color-fab-bg)] px-6 py-4 text-left text-[var(--theme-color-fab-fg)] font-medium outline-none shadow m-px before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12]"
    >
      {icon}
      <span class="flex-1 truncate">{children}</span>
      <Ripple />
    </button>
  );
}
