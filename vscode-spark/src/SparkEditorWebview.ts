import {
  Disposable,
  Uri,
  ViewColumn,
  Webview,
  WebviewPanel,
  window,
} from "vscode";
import { getNonce } from "./utils/getNonce";
import { getUri } from "./utils/getUri";

/**
 * This class manages the state and behavior of SparkEditor webview panels.
 *
 * It contains all the data and methods for:
 *
 * - Creating and rendering SparkEditor webview panels
 * - Properly cleaning up and disposing of webview resources when the panel is closed
 * - Setting the HTML (and by proxy CSS/JavaScript) content of the webview panel
 */
export class SparkEditorWebview {
  public static current: SparkEditorWebview | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  /**
   * The class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri) {
    this._panel = panel;

    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content for the webview panel
    this._panel.webview.html = this.getWebviewContent(
      this._panel.webview,
      extensionUri
    );
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static render(extensionUri: Uri) {
    if (SparkEditorWebview.current) {
      // If the webview panel already exists reveal it
      SparkEditorWebview.current._panel.reveal(ViewColumn.One);
    } else {
      // If a webview panel does not already exist create and show a new one
      const panel = window.createWebviewPanel(
        // Panel view type
        "spark.showEditor",
        // Panel title
        "Spark Editor",
        // The editor column the panel should be displayed in
        ViewColumn.One,
        // Extra panel configurations
        {
          // Enable JavaScript in the webview
          enableScripts: true,
          // Restrict the webview to only load resources from the `out` directory
          localResourceRoots: [Uri.joinPath(extensionUri, "out")],
        }
      );

      SparkEditorWebview.current = new SparkEditorWebview(panel, extensionUri);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    SparkEditorWebview.current = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) associated with the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where *references* to CSS and JavaScript files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @param extensionUri The URI of the directory containing the extension
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
  private getWebviewContent(webview: Webview, extensionUri: Uri) {
    const jsMainUri = getUri(webview, extensionUri, ["out", "main.js"]);
    const fontFamilyMono = "Courier Prime Sans";
    const fontFormatMono = "truetype";
    const fontPathMono = getUri(webview, extensionUri, [
      "out",
      "fonts",
      "courier-prime-sans.ttf",
    ]);
    const fontPathMonoBold = getUri(webview, extensionUri, [
      "out",
      "fonts",
      "courier-prime-sans-bold.ttf",
    ]);
    const fontPathMonoItalic = getUri(webview, extensionUri, [
      "out",
      "fonts",
      "courier-prime-sans-italic.ttf",
    ]);
    const fontPathMonoBoldItalic = getUri(webview, extensionUri, [
      "out",
      "fonts",
      "courier-prime-sans-bold-italic.ttf",
    ]);
    const styleNonce = getNonce();
    const scriptNonce = getNonce();
    return /*html*/ `
      <!DOCTYPE html>
      <html class="s-theme-dark se-theme" lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${styleNonce}'; font-src ${webview.cspSource}; media-src ${webview.cspSource}; img-src ${webview.cspSource} https: data: ; script-src 'nonce-${scriptNonce}';">
          <title>Spark Editor</title>
          <style nonce="${styleNonce}">
            @font-face {
              font-family: "${fontFamilyMono}";
              font-weight: 400;
              font-display: block;
              src: url("${fontPathMono}") format("${fontFormatMono}");
            }
            @font-face {
              font-family: "${fontFamilyMono}";
              font-weight: 700;
              font-display: block;
              src: url("${fontPathMonoBold}") format("${fontFormatMono}");
            }
            @font-face {
              font-family: "${fontFamilyMono}";
              font-style: italic;
              font-weight: 400;
              font-display: block;
              src: url("${fontPathMonoItalic}") format("${fontFormatMono}");
            }
            @font-face {
              font-family: "${fontFamilyMono}";
              font-style: italic;
              font-weight: 700;
              font-display: block;
              src: url("${fontPathMonoBoldItalic}") format("${fontFormatMono}");
            }

            html {
              height: 100%;
              padding: 0;
              margin: 0;
              overflow: hidden;
            }

            body {
              height: 100%;
              padding: 0;
              margin: 0;
              opacity: 0;
              display: flex;
              flex-direction: column;
              font-size: 0.875rem;
              font-family: var(--s-font-sans);
            }

            body.ready {
              opacity: 1;
              transition: 0.25s opacity;
            }

            body {
              --s-color-tab-active: var(--s-color-neutral-100);
              --s-color-tab-inactive: hsl(0 0% 45%);
              --s-color-fab-fg: white;
              --s-color-fab-bg: var(--vscode-custom-button-background);
              --s-color-primary-bg: var(--vscode-custom-editor-navigation-background);
              --s-color-panel: var(--vscode-custom-editor-background);
            }
          </style>
        </head>
        <body>
          <se-header-navigation></se-header-navigation>
          <se-gui></se-gui>
          <script type="module" nonce="${scriptNonce}" src="${jsMainUri}"></script>
        </body>
      </html>
    `;
  }
}
