import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a body written with brace blocks", () => {
  test("well-formed source round-trips unchanged", () => {
    const source = `style button {
  cursor = pointer
  &.secondary { background-color = slate_50 }
  @hovered, @pressed {
    background-color = sky_50
  }
}

animation fade {
  keyframes {
    from { opacity = 0 }
    to { opacity = 1 }
  }
  timing = {
    duration = 0.4,
    easing = ease-in-out,
  }
}

morph blink {
  method = bend
  keyframes {
    { offset = 0; eyes { state = eyes.open } }
    { offset = 0.4; eyes { state = eyes.closed } }
  }
  clips {
    { between { eyelash-left }; targets { eyeball-white-left; pupil-left } }
  }
}
`;
    expect(formatSource(source)).toBe(source);
  });

  test("lines inside a block indent by its braces, and the lines after it keep their level", () => {
    const source = `animation fade {
      keyframes {
from { opacity = 0 }
          to {
   opacity = 1
        }
  }
  timing={duration=1;delay = 2,}
}
`;
    expect(formatSource(source)).toBe(`animation fade {
  keyframes {
    from { opacity = 0 }
    to {
      opacity = 1
    }
  }
  timing = { duration=1; delay = 2, }
}
`);
  });
});
