import { describe, expect, it } from "vitest";
import {
  abbreviateAge,
  formatModified,
  getFileSizeDisplayValue,
} from "../../src/modules/spark-editor/utils/fileMeta";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe("getFileSizeDisplayValue", () => {
  it("shows raw bytes under 1 kiB", () => {
    expect(getFileSizeDisplayValue(0)).toBe("0 B");
    expect(getFileSizeDisplayValue(512)).toBe("512 B");
    expect(getFileSizeDisplayValue(1023)).toBe("1023 B");
  });

  it("scales to kB/MB with one decimal (binary thresholds)", () => {
    expect(getFileSizeDisplayValue(1024)).toBe("1 kB");
    expect(getFileSizeDisplayValue(1536)).toBe("1.5 kB");
    expect(getFileSizeDisplayValue(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(getFileSizeDisplayValue(1024 * 1024 * 1024)).toBe("1 GB");
  });

  it("returns empty for missing/non-finite sizes", () => {
    expect(getFileSizeDisplayValue(undefined)).toBe("");
    expect(getFileSizeDisplayValue(NaN)).toBe("");
  });
});

describe("abbreviateAge", () => {
  it("buckets the age into Now / m / h / d / mo / y", () => {
    expect(abbreviateAge(new Date())).toBe("Now");
    expect(abbreviateAge(new Date(Date.now() - 5 * MIN))).toBe("5m");
    expect(abbreviateAge(new Date(Date.now() - 2 * HOUR))).toBe("2h");
    expect(abbreviateAge(new Date(Date.now() - 3 * DAY))).toBe("3d");
    expect(abbreviateAge(new Date(Date.now() - 2 * MONTH))).toBe("2mo");
    expect(abbreviateAge(new Date(Date.now() - 2 * YEAR))).toBe("2y");
  });

  it("returns empty for a missing/invalid date", () => {
    expect(abbreviateAge(undefined)).toBe("");
    expect(abbreviateAge(new Date(NaN))).toBe("");
  });
});

describe("formatModified", () => {
  it("prefixes the age with 'Modified '", () => {
    expect(formatModified(Date.now())).toBe("Modified Now");
    expect(formatModified(Date.now() - 2 * HOUR)).toBe("Modified 2h");
  });

  it("returns empty when there is no timestamp", () => {
    expect(formatModified(undefined)).toBe("");
    expect(formatModified(0)).toBe("");
  });
});
