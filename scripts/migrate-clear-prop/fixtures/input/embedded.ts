const greeting = "Hello.";

export const PLAIN = `layout main {
  stage {
    portrait { image }
  }
}
`;

export const INTERPOLATED = `layout textbox {
  dialogue {
    text
  }
}

scene start
  ${greeting}
end
`;

export const SCREEN_ONLY = `screen menu {
  caption {
    text
  }
  slot
}
`;

export const UNRELATED = `portrait {
  image
}
`;
