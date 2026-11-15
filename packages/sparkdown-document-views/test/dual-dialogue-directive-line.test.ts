import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

const visibleGridRows = (contentHTML: string): string[] => {
  const host = document.createElement("div");
  host.innerHTML = contentHTML;
  const rows: string[] = [];
  host.querySelectorAll<HTMLElement>("div").forEach((el) => {
    if (!el.style.display.includes("grid")) {
      return;
    }
    el.querySelectorAll<HTMLElement>("div").forEach((row) => {
      if (row.querySelector("div")) {
        return;
      }
      if (row.closest("[style*='display: none']")) {
        return;
      }
      rows.push((row.textContent ?? "").trim());
    });
  });
  return rows;
};

const pdfDialogueRows = (source: string): string[] =>
  extractPdfText(source)
    .split("\n")
    .map((line) => line.replace(/^<[^>]*>\s?/, "").trim());

describe("directive-only dialogue line in dual dialogue", () => {
  it("takes no row on the page when it is on the left side", () => {
    const source =
      `GUIDE [<]:\n` +
      `  [[guide_happy]]\n` +
      `  Left.\n` +
      `\n` +
      `VISITOR [>]:\n` +
      `  Right.\n`;
    const rows = visibleGridRows(renderPreview(source).contentHTML);
    expect(rows).toEqual(pdfDialogueRows(source));
  });

  it("takes no row on the page when it is on the right side", () => {
    const source =
      `GUIDE [<]:\n` +
      `  Left.\n` +
      `\n` +
      `VISITOR [>]:\n` +
      `  [[visitor_happy]]\n` +
      `  Right.\n`;
    const rows = visibleGridRows(renderPreview(source).contentHTML);
    expect(rows).toEqual(pdfDialogueRows(source));
  });
});
