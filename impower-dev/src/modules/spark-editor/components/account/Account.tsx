import {
  BrandGoogleDrive,
  Download,
  Logout,
  Ripple,
  Trash,
  Upload,
} from "@impower/impower-ui/components";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { downloadProjectZip } from "../../utils/downloadProjectZip";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type AccountProps = Partial<typeof propDefaults>;

export default function Account(_p: AccountProps) {
  const account = workspace.signals.account.value;
  const signinLabel = workspace.signals.signinLabel.value;
  const [signoutOpen, setSignoutOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const accountRowRef = useRef<HTMLDivElement | null>(null);

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
    (async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      try {
        const info = await Workspace.sync.google.getCurrentAccount();
        if (!cancelled) {
          Workspace.window.setAccount(info);
        }
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
    };
  }, []);

  const handleImportProjectChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const buffer = await file.arrayBuffer();
    await Workspace.window.importLocalProject(file.name, buffer);
    target.value = "";
  };

  const handleClearOpfs = async () => {
    if (
      !window.confirm(
        "Clear OPFS? This permanently deletes the local editor project in this browser.",
      )
    )
      return;
    try {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) names.push(name);
      for (const name of names) {
        await root.removeEntry(name, { recursive: true });
      }
    } catch (e) {
      console.error("Failed to clear OPFS", e);
    }
    location.reload();
  };

  const handleSignIn = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    try {
      const info = await Workspace.sync.google.signIn();
      Workspace.window.setAccount(info);
    } catch (err) {
      console.error(err);
      Workspace.window.clearAccount();
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
      Workspace.window.clearAccount();
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
      Workspace.window.startPickingRemoteProjectResource();
      const fileId = await provider.pickRemoteProjectFile(token);
      if (fileId) {
        Workspace.window.unloadProject();
        Workspace.window.loadNewProject(fileId);
      }
      Workspace.window.finishPickingRemoteProjectResource();
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
      Workspace.window.startPickingRemoteProjectResource();
      const folderId = await provider.pickRemoteProjectFolder(token);
      if (folderId) {
        await Workspace.window.saveRemoteProject(folderId);
      }
      Workspace.window.finishPickingRemoteProjectResource();
    } catch (err) {
      console.error(err);
    }
  };

  const offline = account?.offline;

  return (
    <div class="flex flex-1 flex-col">
      {account ? (
        <>
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
          <div ref={accountRowRef} class="relative">
            <button
              type="button"
              onClick={() => setSignoutOpen((v) => !v)}
              class="relative flex w-full cursor-pointer flex-row items-center gap-6 overflow-hidden bg-engine-700 px-6 py-4 text-left text-white outline-none m-px shadow before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12]"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                {account.displayName ? (
                  <div class="truncate text-base font-semibold text-white">
                    {account.displayName}
                  </div>
                ) : null}
                {account.email ? (
                  <div class="truncate text-sm font-normal text-white opacity-70">
                    {account.email}
                  </div>
                ) : null}
              </div>
              <Ripple />
            </button>
            {signoutOpen ? (
              <div
                role="menu"
                class="absolute inset-x-0 top-full mt-1 overflow-hidden rounded-lg bg-popup py-2 shadow-lg"
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
            onClick={downloadProjectZip}
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

      {import.meta.env.DEV ? (
        <Row icon={<Trash class="size-5" />} onClick={handleClearOpfs}>
          Clear OPFS (dev)
        </Row>
      ) : null}
    </div>
  );
}

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
      class="relative flex w-full cursor-pointer flex-row items-center gap-6 overflow-hidden bg-transparent px-6 py-4 text-left text-white font-medium outline-none transition-colors duration-150 hover:bg-foreground/5 active:bg-foreground/[0.12] disabled:pointer-events-none disabled:opacity-50"
    >
      {icon}
      <span class="flex-1 truncate">{children}</span>
      <Ripple />
    </button>
  );
}

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
      class="relative flex w-full cursor-pointer flex-row items-center gap-6 overflow-hidden bg-engine-700 px-6 py-4 text-left text-white font-medium outline-none shadow m-px before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12]"
    >
      {icon}
      <span class="flex-1 truncate">{children}</span>
      <Ripple />
    </button>
  );
}
