export const PAGE_CSS = `
html {
  background-color: rgb(235, 234, 232);
}

body {
  margin: 0;
}

#workskin #script {
  width: 850px;
  max-width: 100%;
  margin: 0px auto 0;
}

#workskin .page {
  border: 1px solid;
  border-color: transparent;
  border-radius: 2px;
  cursor: text;
  letter-spacing: 0 !important;
  margin-bottom: 25px;
  position: relative;
  text-align: left;
  width: 100%;
  z-index: 200;
  box-shadow: 0px 0px 28px 0px rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
  background-color: white;
  color: #333;
}

#workskin .innerpage {
  max-width: 640px;
  margin: auto;
  padding: 68px 24px;
}`.trim();

export const TITLE_CSS = `
#workskin .title-grid {
  display: grid;
  height: 1169px;
  width: 100%;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  grid-template-rows: 200px 1fr 300px;
}

#workskin .title-tl {
  grid-column-start: 1;
  grid-column-end: 3;
}

#workskin .title=tc {
  grid-column-start: 3;
  grid-column-end: 5;
  text-align: center;
}

#workskin .title-tr {
  grid-column-start: 5;
  grid-column-end: 7;
  text-align: right;
}

#workskin .title-cc {
  grid-column-start: 1;
  grid-column-end: 7;
  text-align: center;
  align-self: center;
}

#workskin .title-bl {
  grid-column-start: 1;
  grid-column-end: 4;
  align-self: end;
}

#workskin .title-br {
  grid-column-start: 4;
  grid-column-end: 7;
  text-align: right;
  align-self: end;
}`.trim();

export const MAIN_CSS = `
#workskin {
  font-family: sparkdown-font, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 16px;
}

#workskin * {
  box-sizing: border-box;
}

#workskin hr {
  border-width: 0;
  border-style: solid;
  border-color: rgba(0, 0, 0, 0.2);
  border-bottom-width: thin;
  margin: 2em 0;
}

#workskin p {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
}

#workskin .dialogue {
  width: 60%;
  margin: 0 auto;
}

#workskin .dialogue_character {
  width: 60%;
  margin: 0 auto;
  padding-left: 16%;
}

#workskin .parenthetical {
  width: 60%;
  margin: 0 auto;
  padding-left: 8%;
}

#workskin .dual {
  width: 95%;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

#workskin .dual .dialogue {
  width: 90%;
}

#workskin .dual .dialogue_character {
  width: 90%;
}

#workskin .dual .parenthetical {
  width: 90%;
}

#workskin .section {
  opacity: 0.2;
  margin-left: -30px;
}`.trim();

export const STATIC_CSS = `
${PAGE_CSS}

${TITLE_CSS}

${MAIN_CSS}`.trim();
