/** JSON encoding for protocol messages whose existing fields carry binary data. */
export function stringifyProtocolJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!(item instanceof ArrayBuffer)) return item;
    const bytes = new Uint8Array(item);
    let text = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return { $sparkBuffer: btoa(text) };
  });
}

export function parseProtocolJSON(text: string): unknown {
  return JSON.parse(text, (_key, item) => {
    if (item && typeof item === "object" && Object.keys(item).length === 1 && typeof item.$sparkBuffer === "string") {
      const binary = atob(item.$sparkBuffer);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return bytes.buffer;
    }
    return item;
  });
}
