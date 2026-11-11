import {
  Button,
  DownloadIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  ImageIcon,
  ListRow,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@impower/impower-ui/components";
import { useRef, useState } from "preact/hooks";
import { bytesLabel } from "../../utils/fileListModel";
import type { ImageStack } from "../../utils/imageStacks";
import { filesSummary, fileRows, type FileRow } from "../../utils/imageVariants";
import { showSnackbar } from "../../utils/snackbar";
import type { Workspace as WorkspaceIntents } from "../../workspace/Workspace";
import { DeleteDialog, NameRow } from "../library-page";
import Section from "./Section";

export type FilesSectionProps = {
  stack: ImageStack;
  sizes: Readonly<Record<string, number>>;
  intents: () => Promise<typeof WorkspaceIntents>;
};

const report = (error: unknown) =>
  showSnackbar({ message: error instanceof Error ? error.message : String(error) });

const stemAndExtension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

function FileMenu({ row, onAction }: { row: FileRow; onAction: (action: "rename" | "download" | "delete") => void }) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="quiet" size="icon" aria-label={`Options for ${row.name}`} class="flex-none text-muted">
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        <DropdownItem onSelect={() => onAction("rename")}>
          <PencilIcon class="text-muted" />
          Rename
        </DropdownItem>
        <DropdownItem onSelect={() => onAction("download")}>
          <DownloadIcon class="text-muted" />
          Download
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem class="text-error" onSelect={() => onAction("delete")}>
          <TrashIcon />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}

export default function FilesSection({ stack, sizes, intents }: FilesSectionProps) {
  const rows = fileRows(stack, sizes);
  const picker = useRef<HTMLInputElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FileRow | null>(null);

  const act = (row: FileRow, action: "rename" | "download" | "delete") => {
    if (action === "rename") {
      setRenaming(row.path);
    } else if (action === "delete") {
      setDeleting(row);
    } else {
      void intents()
        .then((Workspace) => Workspace.assets.download(row.path))
        .catch(report);
    }
  };

  const onPicked = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const chosen = [...(input.files ?? [])];
    input.value = "";
    if (!chosen.length) {
      return;
    }
    void intents()
      .then((Workspace) =>
        Workspace.assets.addBeside(
          chosen.map((file) => ({ name: file.name, getBuffer: () => file.arrayBuffer() })),
          stack.cover,
        ),
      )
      .catch(report);
  };

  return (
    <Section title="Files" aside={filesSummary(rows)} label="Files">
      <div role="list" class="-mx-2" data-inspector-files>
        {rows.map((row) => (
          <div role="listitem" key={row.path} class="h-14" data-file-path={row.path}>
            {renaming === row.path ? (
              <NameRow
                icon={<ImageIcon class="text-muted" />}
                label={`Rename ${row.name}`}
                initial={stemAndExtension(row.name)[0]}
                suffix={stemAndExtension(row.name)[1]}
                onCancel={() => setRenaming(null)}
                onCommit={async (name) => {
                  const Workspace = await intents();
                  await Workspace.assets.renameMember(row.path, name);
                  setRenaming(null);
                }}
              />
            ) : (
              <ListRow
                icon={<ImageIcon class="text-muted" />}
                label={row.name}
                description={`${row.role} · ${bytesLabel(row.size)}`}
                actions={<FileMenu row={row} onAction={(action) => act(row, action)} />}
              />
            )}
          </div>
        ))}
      </div>
      <div class="mt-2 flex flex-col items-start gap-1.5">
        <Button variant="quiet" class="-ml-3" data-file-add onClick={() => picker.current?.click()}>
          <PlusIcon />
          Add a layer or alternate…
        </Button>
        <p class="m-0 text-[12px]/[1.5] text-muted" data-file-note>
          {stack.kind === "folder" ? (
            <>
              A file named <code class="font-mono text-ink">NN_group.option.png</code> in this folder adds a layer; NN
              sets where it stacks.
            </>
          ) : (
            <>
              A file named <code class="font-mono text-ink">{stack.name}~group.option.png</code> adds a layer and{" "}
              <code class="font-mono text-ink">{stack.name}@name.png</code> another alternate.
            </>
          )}
        </p>
        <input ref={picker} type="file" multiple accept="image/*" class="hidden" data-file-picker onChange={onPicked} />
      </div>
      <DeleteDialog
        label={deleting?.name ?? null}
        description={deleting ? `${deleting.role}. It moves to the bin, and ${stack.name} keeps its other files.` : ""}
        onClose={() => setDeleting(null)}
        onDelete={() => {
          const row = deleting!;
          setDeleting(null);
          void intents()
            .then((Workspace) => Workspace.assets.removeMember(row.path))
            .catch(report);
        }}
      />
    </Section>
  );
}
