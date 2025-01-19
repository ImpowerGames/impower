import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-screenplay-toolbar",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      running:
        stores?.workspace?.current?.preview?.modes?.game?.running || false,
      paused: stores?.workspace?.current?.preview?.modes?.game?.paused || false,
      debugging:
        stores?.workspace?.current?.preview?.modes?.game?.debugging || false,
      loading:
        stores?.workspace?.current?.preview?.modes?.game?.loading || false,
      horizontalLayout: stores?.workspace?.current?.screen?.horizontalLayout,
    } as const),
  html: ({ context }) => {
    const { horizontalLayout } = context;
    return html`
      <s-box
        bg-color="${horizontalLayout ? "panel" : "black"}"
        position="sticky-top"
      >
        <se-header-navigation-placeholder></se-header-navigation-placeholder>
        <s-box
          height="panel-nav"
          position="relative"
          child-layout="row"
          child-align="center"
          bg-color="${horizontalLayout ? "panel" : "black"}"
          z="1"
          grow
        >
          <s-button
            id="downloadButton"
            variant="text"
            width="48"
            height="44"
            text-size="2xs"
            child-layout="column"
            color="primary-70"
          >
            <s-icon name="download" icon-size="1.125rem"></s-icon>
            PDF
          </s-button>
          <s-box child-layout="row" child-align="center" grow>
            <s-box child-layout="row" child-align="center" grow>
              <s-box text-size="md" p="16" text-align="center" grow
                >Screenplay Preview</s-box
              >
            </s-box>
          </s-box>
          <se-preview-mode-toggle></se-preview-mode-toggle>
          <s-box
            id="progressBar"
            position="absolute"
            i-b="0"
            i-lr="0"
            width="100%"
            height="3"
            bg-color="primary-70"
            pivot="left"
            grow
          ></s-box>
        </s-box>
      </s-box>
    `;
  },
  css,
  selectors: {
    downloadButton: "",
    progressBar: "",
  },
});
