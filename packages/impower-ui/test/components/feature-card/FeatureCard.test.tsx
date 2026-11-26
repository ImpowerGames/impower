import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { PlayIcon } from "../../../src/components/icon/icons.generated";
import FeatureCard from "../../../src/components/feature-card/FeatureCard";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("FeatureCard", () => {
  it("draws the glyph, heading, sentence and extra content in order, and is not a button", async () => {
    await mount(
      <FeatureCard icon={PlayIcon} title="Export a game" sentence="Package it." class="extra">
        <a href="#x">Link</a>
      </FeatureCard>,
    );
    const card = host!.querySelector("article")!;
    expect(card.classList.contains("extra")).toBe(true);
    expect(Array.from(card.children).map((child) => child.tagName.toLowerCase())).toEqual(["svg", "h2", "p", "a"]);
    expect(card.querySelector("h2")!.textContent).toBe("Export a game");
    expect(card.querySelector("button")).toBeNull();
    expect(card.getAttribute("role")).toBeNull();
  });

  it("gives the sentence no fixed height", async () => {
    await mount(<FeatureCard icon={PlayIcon} title="Export" sentence="Print it." />);
    expect(host!.querySelector("article > p")!.className).not.toMatch(/min-h-\[/);
  });

  it("draws a row as the glyph beside its title and sentence, with no action", async () => {
    await mount(
      <FeatureCard layout="row" icon={PlayIcon} title="Export a game" sentence="Package it." class="extra" />,
    );
    const row = host!.querySelector("article")!;
    expect(row.classList.contains("extra")).toBe(true);
    expect(row.classList).toContain("flex");
    expect(row.classList).not.toContain("flex-col");
    expect(Array.from(row.children).map((child) => child.tagName.toLowerCase())).toEqual(["svg", "div"]);
    expect(row.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(row.querySelector("h3")!.textContent).toBe("Export a game");
    expect(row.querySelector("p")!.textContent).toBe("Package it.");
    expect(row.querySelector("a, button, [tabindex]")).toBeNull();
    expect(row.getAttribute("role")).toBeNull();
  });
});
