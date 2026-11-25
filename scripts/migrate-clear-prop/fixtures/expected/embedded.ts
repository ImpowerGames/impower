const greeting = "Hello.";

export const PLAIN = `layout main {
  stage {
    portrait #clear { image }
  }
}
`;

export const INTERPOLATED = `layout textbox {
  dialogue #clear {
    text
  }
}

scene start
  ${greeting}
end
`;

export const SCREEN_ONLY = `screen menu {
  caption #clear {
    text
  }
  slot
}
`;

const wrap = (body: string) => body;

export const NESTED = `${wrap(`layout textbox {
  action #clear {
    text
  }
}
`)}`;

export const UNRELATED = `portrait {
  image
}
`;
