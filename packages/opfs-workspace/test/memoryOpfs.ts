const fail = (name: string, message: string) => new DOMException(message, name);

export class MemoryFile {
  kind = "file" as const;
  bytes = new Uint8Array();
  lastModified = 1;
  history: Uint8Array[] = [];
  gate?: Promise<void>;
  constructor(public name: string) {}
  async getFile() {
    const bytes = this.bytes.slice();
    return {
      name: this.name,
      size: bytes.byteLength,
      lastModified: this.lastModified,
      arrayBuffer: async () => bytes.buffer,
      text: async () => new TextDecoder().decode(bytes),
    };
  }
  async createSyncAccessHandle() {
    await this.gate;
    return {
      truncate: () => {
        this.bytes = new Uint8Array();
      },
      write: (data: DataView | Uint8Array) => {
        this.bytes = new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        ).slice();
        this.history.push(this.bytes);
        this.lastModified += 1;
        return this.bytes.byteLength;
      },
      flush: () => {},
      close: () => {},
    };
  }
}

export class MemoryDirectory {
  kind = "directory" as const;
  entries = new Map<string, MemoryDirectory | MemoryFile>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const entry = this.entries.get(name);
    if (entry instanceof MemoryDirectory) return entry;
    if (entry) throw fail("TypeMismatchError", `${name} is a file`);
    if (!options.create) throw fail("NotFoundError", `${name} not found`);
    const created = new MemoryDirectory(name);
    this.entries.set(name, created);
    return created;
  }
  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    const entry = this.entries.get(name);
    if (entry instanceof MemoryFile) return entry;
    if (entry) throw fail("TypeMismatchError", `${name} is a directory`);
    if (!options.create) throw fail("NotFoundError", `${name} not found`);
    const created = new MemoryFile(name);
    this.entries.set(name, created);
    return created;
  }
  async removeEntry(name: string, options: { recursive?: boolean } = {}) {
    const entry = this.entries.get(name);
    if (!entry) throw fail("NotFoundError", `${name} not found`);
    if (
      entry instanceof MemoryDirectory &&
      entry.entries.size > 0 &&
      !options.recursive
    ) {
      throw fail("InvalidModificationError", `${name} is not empty`);
    }
    this.entries.delete(name);
  }
  async *values() {
    yield* [...this.entries.values()];
  }
}

export const memoryRoot = () => new MemoryDirectory("");

export const writeMemoryFile = (
  root: MemoryDirectory,
  path: string,
  bytes: Uint8Array,
) => {
  const parts = path.split("/");
  let dir = root;
  for (const name of parts.slice(0, -1)) {
    let next = dir.entries.get(name);
    if (!next) {
      next = new MemoryDirectory(name);
      dir.entries.set(name, next);
    }
    dir = next as MemoryDirectory;
  }
  const file = new MemoryFile(parts[parts.length - 1]!);
  file.bytes = bytes;
  dir.entries.set(file.name, file);
};

export const makeMemoryDirectory = (root: MemoryDirectory, path: string) => {
  let dir = root;
  for (const name of path.split("/")) {
    let next = dir.entries.get(name);
    if (!next) {
      next = new MemoryDirectory(name);
      dir.entries.set(name, next);
    }
    dir = next as MemoryDirectory;
  }
};

export const listMemory = (root: MemoryDirectory, prefix = "") => {
  const out: string[] = [];
  const walk = (dir: MemoryDirectory, path: string) => {
    for (const [name, entry] of dir.entries) {
      const next = path ? `${path}/${name}` : name;
      if (entry instanceof MemoryDirectory) {
        out.push(`${next}/`);
        walk(entry, next);
      } else {
        out.push(next);
      }
    }
  };
  const start = prefix
    ? prefix.split("/").reduce<MemoryDirectory | undefined>(
        (dir, name) => dir?.entries.get(name) as MemoryDirectory | undefined,
        root,
      )
    : root;
  if (start) walk(start, "");
  return out.sort();
};
