import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";

const compare = (source: string) => {
  const pdf = extractPdfText(source);
  const preview = extractPreviewText(source);
  return { pdf, preview };
};

describe("preview vs pdf — visible text parity", () => {
  it("plain action line", () => {
    const { pdf, preview } = compare(
      `Bunny enters the room.\n`,
    );
    expect(preview).toBe(pdf);
  });

  it("dialogue", () => {
    const { pdf, preview } = compare(
      `BUNNY:\n  Hello, world.\n`,
    );
    expect(preview).toBe(pdf);
  });

  it("scene heading", () => {
    const { pdf, preview } = compare(
      `INT. CASINO - NIGHT\n`,
    );
    expect(preview).toBe(pdf);
  });

  it("BREAK character > should not appear in preview", () => {
    const { pdf, preview } = compare(
      `BUNNY:\n  Ready? >\n  3. 2. 1.\n`,
    );
    expect(preview).toBe(pdf);
  });

  it("inline image directive [[ ]] is hidden", () => {
    const { pdf, preview } = compare(
      `[[show backdrop x]] The lights come up.\n`,
    );
    expect(preview).toBe(pdf);
  });

  it("inline audio directive (( )) is hidden", () => {
    const { pdf, preview } = compare(
      `((play music)) The lights come up.\n`,
    );
    expect(preview).toBe(pdf);
  });
});
