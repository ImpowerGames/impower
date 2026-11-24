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

export const UNRELATED = `portrait {
  image
}
`;
