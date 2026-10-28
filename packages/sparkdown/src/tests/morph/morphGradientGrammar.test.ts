import { describe, expect, test } from "vitest";
import { readGradient } from "../../morph/gradient";
import { readArtDocument } from "../../morph/svgDocument";

describe("gradients are read within a closed grammar", () => {
  const read = (defs: string, id = "a") => {
    const doc = readArtDocument(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs>${defs}</defs></svg>`)!;
    return readGradient(doc, id);
  };
  const STOPS = '<stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>';

  test("defaults, an href chain, transforms, stop opacity and offsets", () => {
    expect(read(`<linearGradient id="a">${STOPS}</linearGradient>`)).toEqual({
      kind: "linear",
      units: "objectBoundingBox",
      spread: "pad",
      geometry: [0, 0, 1, 0],
      transform: [1, 0, 0, 1, 0, 0],
      stops: [
        [0, [0, 0, 0, 1]],
        [1, [255, 255, 255, 1]],
      ],
    });
    // Coordinates come only from gradients of the first one's kind; the rest from the chain.
    const chained = read(`<linearGradient id="a" href="#t" x2="0.5" gradientTransform="translate(1, 2) scale(2)"/><radialGradient id="t" cx="0.2" spreadMethod="reflect">${STOPS}</radialGradient>`);
    expect(chained).toMatchObject({ kind: "linear", spread: "reflect", geometry: [0, 0, 0.5, 0], transform: [2, 0, 0, 2, 1, 2] });
    expect(chained!.stops).toHaveLength(2);
    // A namespace declaration that names SVG again changes nothing.
    expect(read(`<linearGradient xmlns="http://www.w3.org/2000/svg" id="a">${STOPS}</linearGradient>`)).toBeDefined();
    expect(read(`<radialGradient id="a" gradientUnits="userSpaceOnUse" cx="5" cy="6" r="4" fy="7" fr="0%">${STOPS}</radialGradient>`)!.geometry).toEqual([5, 6, 4, 5, 7, 0]);
    const stops = read(
      `<linearGradient id="a" color="#00f"><stop offset="0.6" stop-color="#f00" stop-opacity="0.5"/><stop offset="0.2" style="stop-color:currentColor"/><stop offset="150%" stop-color="inherit"/></linearGradient>`,
    )!.stops;
    expect(stops).toEqual([
      [0.6, [255, 0, 0, 0.5]],
      [0.6, [0, 0, 255, 1]],
      [1, [0, 0, 0, 1]],
    ]);
  });

  const outside: [string, string][] = [
    ["an inline style on the gradient", `<linearGradient id="a" style="transform:scale(2)">${STOPS}</linearGradient>`],
    ["a transform attribute", `<linearGradient id="a" transform="scale(2)">${STOPS}</linearGradient>`],
    ["a user-space percentage", `<linearGradient id="a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="50%" y2="0">${STOPS}</linearGradient>`],
    ["a user-space default end", `<linearGradient id="a" gradientUnits="userSpaceOnUse">${STOPS}</linearGradient>`],
    ["a unit in a transform", `<linearGradient id="a" gradientTransform="translate(1px)">${STOPS}</linearGradient>`],
    ["transforms with no separator", `<linearGradient id="a" gradientTransform="rotate(10)scale(2)">${STOPS}</linearGradient>`],
    ["a padded unit keyword", `<linearGradient id="a" gradientUnits=" userSpaceOnUse">${STOPS}</linearGradient>`],
    ["a miscased spread", `<linearGradient id="a" spreadMethod="Pad">${STOPS}</linearGradient>`],
    ["a malformed coordinate", `<linearGradient id="a" x2="1e">${STOPS}</linearGradient>`],
    ["a padded coordinate", `<linearGradient id="a" x2=" 1">${STOPS}</linearGradient>`],
    ["a negative radius", `<radialGradient id="a" r="-1">${STOPS}</radialGradient>`],
    ["a missing link", `<linearGradient id="a" href="#nope"/>`],
    ["a link loop", `<linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>`],
    ["a link to a pattern", `<linearGradient id="a" href="#b"/><pattern id="b"/>`],
    ["a link in another namespace prefix", `<linearGradient id="a" xl:href="#b"/><linearGradient id="b">${STOPS}</linearGradient>`],
    ["an animation in the gradient", `<linearGradient id="a">${STOPS}<animate attributeName="x2" to="0"/></linearGradient>`],
    ["an animated stop", `<linearGradient id="a"><stop offset="0"><animate attributeName="offset" to="1"/></stop></linearGradient>`],
    ["no stops", `<linearGradient id="a"/>`],
    ["color-interpolation on the gradient", `<linearGradient id="a" color-interpolation="linearRGB">${STOPS}</linearGradient>`],
    ["color-interpolation on an ancestor", `<g color-interpolation="linearRGB"><linearGradient id="a">${STOPS}</linearGradient></g>`],
    ["color-interpolation spelled with an escape on an ancestor", `<g style="c\\6flor-interpolation:linearRGB"><linearGradient id="a">${STOPS}</linearGradient></g>`],
    ["color-interpolation behind a comment on an ancestor", `<g style="/*x*/color-interpolation:linearRGB"><linearGradient id="a">${STOPS}</linearGradient></g>`],
    ["an ancestor's all", `<g style="all:inherit"><linearGradient id="a">${STOPS}</linearGradient></g>`],
    ["a coordinate too large for a double", `<linearGradient id="a" x2="1e999">${STOPS}</linearGradient>`],
    ["a transform too large for a double", `<linearGradient id="a" gradientTransform="scale(1e999)">${STOPS}</linearGradient>`],
    ["a stop colour too large for a double", `<linearGradient id="a"><stop offset="0" stop-color="hsl(1e999, 50%, 50%)"/></linearGradient>`],
    ["a gradient in another namespace", `<linearGradient xmlns="urn:not-svg" id="a">${STOPS}</linearGradient>`],
    ["a gradient under an ancestor in another namespace", `<g xmlns="urn:not-svg"><linearGradient id="a">${STOPS}</linearGradient></g>`],
    ["a stop in another namespace", `<linearGradient id="a"><stop xmlns="urn:not-svg" offset="0" stop-color="#000"/></linearGradient>`],
    ["a padded offset", `<linearGradient id="a"><stop offset=" 0.5" stop-color="#000"/></linearGradient>`],
    ["a stop style declaring anything else", `<linearGradient id="a"><stop offset="0" style="stop-color:#000;display:none"/></linearGradient>`],
    ["a stop colour outside the paint grammar", `<linearGradient id="a"><stop offset="0" stop-color="var(--x)"/></linearGradient>`],
    ["a stop colour of none", `<linearGradient id="a"><stop offset="0" stop-color="none"/></linearGradient>`],
  ];
  test.each(outside)("%s is unknown", (_, defs) => {
    expect(read(defs)).toBeUndefined();
  });
});
