import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

// #1223 reads brace blocks in `style`, `animation`, `theme` and `morph`
// bodies; formatting them by brace depth comes later (#1227). Until then the
// formatter must not change what such a body means.

describe("formatting a body written with brace blocks", () => {
  test("well-formed source round-trips unchanged", () => {
    const source = `style button with
  cursor = pointer
  &.secondary { background-color = slate_50 }
  @hovered, @pressed {
    background-color = sky_50
  }
end

animation fade with
  keyframes {
    from { opacity = 0 }
    to { opacity = 1 }
  }
  timing = {
    duration = 0.4,
    easing = ease-in-out,
  }
end

morph blink with
  method = bend
  keyframes {
    { offset = 0; eyes { state = eyes.open } }
    { offset = 0.4; eyes { state = eyes.closed } }
  }
  clips {
    { between { eyelash-left }; targets { eyeball-white-left; pupil-left } }
  }
end
`;
    expect(formatSource(source)).toBe(source);
  });

  test("lines inside a block keep their indentation, and the lines after it keep their level", () => {
    const source = `animation fade with
      keyframes {
from { opacity = 0 }
          to {
   opacity = 1
        }
  }
  timing={duration=1;delay = 2,}
end
`;
    // Only the block's header line, which sits among the body's indented
    // lines, is re-indented. `timing` stays a sibling of `keyframes`.
    expect(formatSource(source)).toBe(`animation fade with
  keyframes {
from { opacity = 0 }
          to {
   opacity = 1
        }
  }
  timing={duration=1;delay = 2,}
end
`);
  });
});
