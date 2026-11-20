type Range = [first: number, last: number];

const tableOffset = (view: DataView, tag: string): number | undefined => {
  const count = view.getUint16(4);
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const name = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    if (name === tag) return view.getUint32(record + 8);
  }
  return undefined;
};

const format12Ranges = (view: DataView, offset: number): Range[] => {
  const ranges: Range[] = [];
  const groups = view.getUint32(offset + 12);
  for (let index = 0; index < groups; index++) {
    const group = offset + 16 + index * 12;
    ranges.push([view.getUint32(group), view.getUint32(group + 4)]);
  }
  return ranges;
};

const format4Ranges = (view: DataView, offset: number): Range[] => {
  const ranges: Range[] = [];
  const segments = view.getUint16(offset + 6) / 2;
  for (let index = 0; index < segments; index++) {
    const last = view.getUint16(offset + 14 + index * 2);
    const first = view.getUint16(offset + 16 + segments * 2 + index * 2);
    if (first !== 0xffff) ranges.push([first, last]);
  }
  return ranges;
};

export const fontCoverage = (bytes: ArrayBuffer): ((codePoint: number) => boolean) => {
  let ranges: Range[] = [];
  try {
    const view = new DataView(bytes);
    const cmap = tableOffset(view, "cmap");
    if (cmap !== undefined) {
      const subtables = view.getUint16(cmap + 2);
      let best: { offset: number; format: number } | undefined;
      for (let index = 0; index < subtables; index++) {
        const record = cmap + 4 + index * 8;
        const offset = cmap + view.getUint32(record + 4);
        const format = view.getUint16(offset);
        if (format === 12 && best?.format !== 12) best = { offset, format };
        else if (format === 4 && !best) best = { offset, format };
      }
      if (best) ranges = best.format === 12 ? format12Ranges(view, best.offset) : format4Ranges(view, best.offset);
    }
  } catch {
    ranges = [];
  }
  return (codePoint) => ranges.some(([first, last]) => codePoint >= first && codePoint <= last);
};
