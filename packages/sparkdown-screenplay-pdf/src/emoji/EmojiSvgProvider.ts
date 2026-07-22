import { create, type Font, type GlyphRun } from "fontkit";

/**
 * Renders color emoji into a PDF as *vector* graphics by pulling each glyph's
 * artwork out of the font's OpenType-SVG (`SVG `) table.
 *
 * PDFKit/fontkit only embed monochrome glyph outlines and ignore the color
 * tables (`COLR`/`CPAL`/`SVG `), so registering a color emoji font as a text
 * font produces blank glyphs. Noto Color Emoji, however, ships an `SVG ` table
 * whose glyphs are plain `<path fill>` art (plus the occasional gradient). We
 * extract the minimal self-contained SVG for a glyph and hand it to
 * `svg-to-pdfkit`, which emits real PDF vector ops — crisp at any zoom, tiny on
 * disk, and identical in Node and the browser worker (no canvas needed).
 *
 * Noto packs *all* glyphs of a range into a single shared SVG document with a
 * common `<defs>`; each emoji is a `<g id="glyphN">` that `<use>`s shared paths
 * (and sometimes gradients). So per glyph we must collect the transitive
 * closure of the defs it references and assemble a standalone SVG.
 */

interface SvgRecord {
  start: number;
  end: number;
  off: number;
  len: number;
}

interface ParsedDoc {
  doc: string;
  /** id -> outer XML of a `<defs>` child (lazily built) */
  defs: Map<string, string> | null;
  /** gid -> `<g id="glyphN">…</g>` (lazily built, null if absent) */
  groups: Map<number, string | null>;
}

export interface EmojiGlyph {
  id: number;
  /** advance width in font design units */
  advanceWidth: number;
}

export interface EmojiRunGlyph extends EmojiGlyph {
  /** minimal standalone SVG for this glyph, or null if the font has none */
  svg: string | null;
}

export interface EmojiRun {
  glyphs: EmojiRunGlyph[];
  /** total advance of the run, in font design units */
  advanceUnits: number;
}

const REF_REGEX = /(?:xlink:href|href)="#([^"]+)"|url\(#([^)]+)\)/g;

export default class EmojiSvgProvider {
  protected _font: Font;

  protected _bytes: Uint8Array;

  protected _dv: DataView;

  protected _records: SvgRecord[] = [];

  protected _docs = new Map<number, ParsedDoc>();

  protected _svgCache = new Map<number, string | null>();

  protected _runCache = new Map<string, EmojiRun>();

  readonly unitsPerEm: number;

  /** true when the font actually carries a usable `SVG ` table */
  readonly hasSvg: boolean;

  constructor(fontData: ArrayBuffer | Uint8Array) {
    const bytes =
      fontData instanceof Uint8Array ? fontData : new Uint8Array(fontData);
    this._bytes = bytes;
    this._dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // fontkit wants a Node Buffer; Buffer is shimmed in the browser bundle.
    this._font = create(Buffer.from(bytes) as Buffer) as Font;
    this.unitsPerEm = this._font.unitsPerEm || 1000;
    this.hasSvg = this.parseSvgTable();
  }

  /** Shape a string into glyphs, resolving ZWJ/skin-tone sequences via GSUB. */
  layout(text: string): EmojiGlyph[] {
    const run = this._font.layout(text) as GlyphRun;
    return run.glyphs.map((g) => ({
      id: g.id,
      advanceWidth: g.advanceWidth,
    }));
  }

  /**
   * Shape + resolve a whole emoji cluster into its drawable glyphs (each with
   * its SVG) plus the run's total advance. Cached per cluster string.
   */
  getEmojiRun(cluster: string): EmojiRun {
    const cached = this._runCache.get(cluster);
    if (cached) {
      return cached;
    }
    const glyphs: EmojiRunGlyph[] = this.layout(cluster).map((g) => ({
      ...g,
      svg: this.getSvg(g.id),
    }));
    const advanceUnits = glyphs.reduce((sum, g) => sum + g.advanceWidth, 0);
    const run: EmojiRun = { glyphs, advanceUnits };
    this._runCache.set(cluster, run);
    return run;
  }

  /** Minimal standalone SVG for a glyph id, or null if the font has none. */
  getSvg(gid: number): string | null {
    if (this._svgCache.has(gid)) {
      return this._svgCache.get(gid)!;
    }
    let svg: string | null = null;
    try {
      svg = this.buildSvg(gid);
    } catch {
      svg = null;
    }
    this._svgCache.set(gid, svg);
    return svg;
  }

  // ---- SVG table parsing -------------------------------------------------

  protected parseSvgTable(): boolean {
    const dv = this._dv;
    const bytes = this._bytes;
    const numTables = dv.getUint16(4);
    let svgOff = -1;
    for (let i = 0; i < numTables; i += 1) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        bytes[rec]!,
        bytes[rec + 1]!,
        bytes[rec + 2]!,
        bytes[rec + 3]!,
      );
      if (tag === "SVG ") {
        svgOff = dv.getUint32(rec + 8);
        break;
      }
    }
    if (svgOff < 0) {
      return false;
    }
    const docListOff = svgOff + dv.getUint32(svgOff + 2);
    const numDocs = dv.getUint16(docListOff);
    for (let i = 0; i < numDocs; i += 1) {
      const b = docListOff + 2 + i * 12;
      this._records.push({
        start: dv.getUint16(b),
        end: dv.getUint16(b + 2),
        off: docListOff + dv.getUint32(b + 4),
        len: dv.getUint32(b + 8),
      });
    }
    return this._records.length > 0;
  }

  protected recordIndexFor(gid: number): number {
    // records are sorted by glyph id; linear scan is fine (≤ ~700 records)
    for (let i = 0; i < this._records.length; i += 1) {
      const r = this._records[i]!;
      if (gid >= r.start && gid <= r.end) {
        return i;
      }
    }
    return -1;
  }

  protected getParsedDoc(recIndex: number): ParsedDoc {
    const cached = this._docs.get(recIndex);
    if (cached) {
      return cached;
    }
    const rec = this._records[recIndex]!;
    let slice = this._bytes.subarray(rec.off, rec.off + rec.len);
    // OpenType-SVG docs may be gzip-compressed (this font's are not).
    if (slice[0] === 0x1f && slice[1] === 0x8b) {
      slice = this.gunzip(slice);
    }
    const parsed: ParsedDoc = {
      doc: new TextDecoder("utf-8").decode(slice),
      defs: null,
      groups: new Map(),
    };
    this._docs.set(recIndex, parsed);
    return parsed;
  }

  protected gunzip(data: Uint8Array): Uint8Array {
    // Only reached for gzip'd SVG docs. Kept synchronous + optional so the
    // common (uncompressed) path never pulls in zlib.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const zlib = require("zlib");
      return zlib.gunzipSync(Buffer.from(data));
    } catch {
      return data;
    }
  }

  // ---- per-glyph SVG assembly -------------------------------------------

  protected buildSvg(gid: number): string | null {
    const recIndex = this.recordIndexFor(gid);
    if (recIndex < 0) {
      return null;
    }
    const parsed = this.getParsedDoc(recIndex);
    const group = this.getGlyphGroup(parsed, gid);
    if (!group) {
      return null;
    }
    const defsMap = this.getDefsMap(parsed);
    const defs = this.collectDefs(group, defsMap);
    const upem = this.unitsPerEm;
    const advance = this.advanceWidthOf(gid) || upem;
    // OpenType-SVG coordinate system: y-axis points down, origin at the glyph
    // baseline, one unit == one design unit. Emoji art sits above the baseline
    // (negative y), so the em box spans y ∈ [-upem, 0].
    const viewBox = `0 ${-upem} ${advance} ${upem}`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}">` +
      `<defs>${defs}</defs>${group}</svg>`
    );
  }

  protected advanceWidthOf(gid: number): number {
    try {
      return this._font.getGlyph(gid).advanceWidth;
    } catch {
      return this.unitsPerEm;
    }
  }

  protected getGlyphGroup(parsed: ParsedDoc, gid: number): string | null {
    if (parsed.groups.has(gid)) {
      return parsed.groups.get(gid)!;
    }
    const needle = `<g id="glyph${gid}"`;
    const idx = parsed.doc.indexOf(needle);
    const group = idx >= 0 ? this.sliceElement(parsed.doc, idx)[0] : null;
    parsed.groups.set(gid, group);
    return group;
  }

  protected getDefsMap(parsed: ParsedDoc): Map<string, string> {
    if (parsed.defs) {
      return parsed.defs;
    }
    const map = new Map<string, string>();
    const s = parsed.doc;
    const dStart = s.indexOf("<defs>");
    const dEnd = s.indexOf("</defs>");
    if (dStart >= 0 && dEnd > dStart) {
      let i = dStart + "<defs>".length;
      while (i < dEnd) {
        if (s[i] !== "<") {
          i += 1;
          continue;
        }
        const [outer, next] = this.sliceElement(s, i);
        const idm = /\bid="([^"]+)"/.exec(outer);
        if (idm) {
          map.set(idm[1]!, outer);
        }
        i = next;
      }
    }
    parsed.defs = map;
    return map;
  }

  /** Transitive closure of defs referenced by `root`, concatenated. */
  protected collectDefs(root: string, defsMap: Map<string, string>): string {
    const out: string[] = [];
    const seen = new Set<string>();
    const stack: string[] = [];
    this.pushRefs(root, stack);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const el = defsMap.get(id);
      if (!el) {
        continue;
      }
      out.push(el);
      this.pushRefs(el, stack);
    }
    return out.join("");
  }

  protected pushRefs(str: string, stack: string[]): void {
    REF_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = REF_REGEX.exec(str))) {
      stack.push((m[1] || m[2])!);
    }
  }

  /**
   * Slice out the element starting at `start` (which must point at its `<`),
   * returning [outerXML, indexAfterElement]. Handles self-closing tags and
   * balanced nesting of same-named tags.
   */
  protected sliceElement(s: string, start: number): [string, number] {
    const nameMatch = /^<([\w:.-]+)/.exec(s.slice(start, start + 64));
    const name = nameMatch ? nameMatch[1]! : "";
    let gt = s.indexOf(">", start);
    if (gt < 0) {
      return [s.slice(start), s.length];
    }
    if (s[gt - 1] === "/") {
      return [s.slice(start, gt + 1), gt + 1];
    }
    const openRe = new RegExp(`<${name}(?=[\\s/>])`, "g");
    const closeTag = `</${name}>`;
    let depth = 1;
    let p = gt + 1;
    while (depth > 0) {
      const nextClose = s.indexOf(closeTag, p);
      if (nextClose < 0) {
        return [s.slice(start), s.length];
      }
      openRe.lastIndex = p;
      const open = openRe.exec(s);
      if (open && open.index < nextClose) {
        const openGt = s.indexOf(">", open.index);
        if (s[openGt - 1] !== "/") {
          depth += 1;
        }
        p = openGt + 1;
      } else {
        depth -= 1;
        p = nextClose + closeTag.length;
      }
    }
    return [s.slice(start, p), p];
  }
}
