import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { PlayIcon } from "../icon/icons.generated";
import FeatureCard from "./FeatureCard";

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
  it("draws the glyph, heading, sentence, extra content and tag in order, and is not a button", async () => {
    await mount(
      <FeatureCard icon={PlayIcon} title="Export a game" sentence="Package it." tag="Coming soon" class="extra">
        <a href="#x">Link</a>
      </FeatureCard>,
    );
    const card = host!.querySelector("article")!;
    expect(card.classList.contains("extra")).toBe(true);
    expect(Array.from(card.children).map((child) => child.tagName.toLowerCase())).toEqual(["svg", "h2", "p", "a", "span"]);
    expect(card.querySelector("h2")!.textContent).toBe("Export a game");
    expect(card.querySelector("span")!.textContent).toBe("Coming soon");
    expect(card.querySelector("button")).toBeNull();
    expect(card.getAttribute("role")).toBeNull();
  });

  it("omits the tag when none is given", async () => {
    await mount(<FeatureCard icon={PlayIcon} title="Export" sentence="Print it." />);
    expect(host!.querySelector("article > span")).toBeNull();
  });
});
