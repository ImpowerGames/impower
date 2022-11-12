export const STATIC_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      #workspace,
      body {
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        white-space: pre-wrap;
      }

      body {
        background-color: rgb(235, 234, 232);
        color: #333;
        font-size: 14px;
        margin: 0;
        tab-size: 4;
      }

      hr {
        border-width: 0;
        border-style: solid;
        border-color: rgba(0, 0, 0, 0.2);
        border-bottom-width: thin;
        margin-top: 2em;
        margin-bottom: 2em;
      }

      .container {
        margin: 0 auto;
        position: relative;
        width: 850px;
      }

      #workspace {
        color: #333;
        display: none;
        float: left;
        position: relative;
        width: 100%;
      }

      #workspace #script {
        margin: 0px auto 0;
        width: 850px;
      }

      @font-face {
        font-family: sparkdown-font;
        src: url(data:font/ttf;base64,$COURIERPRIME$) format("truetype");
        font-weight: normal;
      }
      @font-face {
        font-family: sparkdown-font;
        src: url(data:font/ttf;base64,$COURIERPRIME-BOLD$) format("truetype");
        font-weight: bold;
      }
      @font-face {
        font-family: sparkdown-font;
        src: url(data:font/ttf;base64,$COURIERPRIME-ITALIC$) format("truetype");
        font-weight: normal;
        font-style: italic;
      }
      @font-face {
        font-family: sparkdown-font;
        src: url(data:font/ttf;base64,$COURIERPRIME-BOLD-ITALIC$)
          format("truetype");
        font-weight: bold;
        font-style: italic;
      }

      #workspace #script .page {
        border: 1px solid;
        border-color: transparent;
        border-radius: 2px;
        cursor: text;
        letter-spacing: 0 !important;
        font-family: sparkdown-font;
        line-height: 107.5%;
        margin-bottom: 25px;
        position: relative;
        text-align: left;
        width: 100%;
        z-index: 200;
        box-shadow: 0px 0px 28px 0px rgba(0, 0, 0, 0.25);
        box-sizing: border-box;
        background-color: white;
        color: black;
      }

      #workspace #script.dpi72 .page {
        font-size: 12px;
        padding: 72px 72px 72px 108px;
      }

      #workspace #script.dpi100 .page {
        font-size: 16px;

        /*
            padding: 100px 100px 100px 150px;
            page-break-after: 100px 12px;*/
      }
      #workspace #script.dpi100 .innerpage {
        max-width: 577px;
        margin-top: 100px;
        margin-bottom: 100px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 42px;
        padding-right: 42px;
      }

      #workspace #script.dpi150 .page {
        font-size: 33px;
        padding: 150px 150px 150px 225px;
      }

      #workspace #script.dpi72 .page h1,
      #workspace #script.dpi72 .page h2,
      #workspace #script.dpi72 .page h3,
      #workspace #script.dpi72 .page h4,
      #workspace #script.dpi72 .page p {
        font-size: 12px;
        font-weight: 400;
      }

      #workspace #script.dpi100 .page h1,
      #workspace #script.dpi100 .page h2,
      #workspace #script.dpi100 .page h3,
      #workspace #script.dpi100 .page h4,
      #workspace #script.dpi100 .page p {
        font-size: 17px;
        font-weight: 400;
      }

      #workspace #script.dpi150 .page h1,
      #workspace #script.dpi150 .page h2,
      #workspace #script.dpi150 .page h3,
      #workspace #script.dpi150 .page h4,
      #workspace #script.dpi150 .page p {
        font-size: 33px;
        font-weight: 400;
      }

      #workspace #script.us-letter.dpi72 {
        width: 612px;
      }

      /*#workspace #script.us-letter.dpi100 {
           /* width: 850px
        }*/

      #workspace #script.us-letter.dpi150 {
        width: 1275px;
      }

      #workspace #script.us-letter.dpi72 .page {
        height: 792px;
      }

      #workspace #script.us-letter.dpi100 .page {
        height: 1100px;
      }

      #workspace #script.us-letter.dpi150 .page {
        height: 1650px;
      }

      #workspace #script.us-letter.dpi72 .page.title-page {
        height: 792px;
      }

      #workspace #script.us-letter.dpi100 .page.title-page {
        height: 1100px;
      }

      #workspace #script.us-letter.dpi150 .page.title-page {
        height: 1650px;
      }

      #workspace #script.a4.dpi72 {
        width: 595px;
      }

      #workspace #script.a4.dpi100 {
        width: auto;
        max-width: 827px;
      }

      #workspace #script.a4.dpi150 {
        width: 1250px;
      }

      #workspace #script.a4.dpi72 .page {
        height: 842px;
      }

      #workspace #script.a4.dpi100 .page {
        height: 1169px;
      }
      #workspace #script.a4.dpi150 .page {
        height: 1754px;
      }

      #workspace #script .page h2 {
        text-align: right;
      }

      #workspace #script .page h2.left-aligned {
        text-align: left;
      }

      #workspace #script .page h3 {
        position: relative;
      }

      div#titlepage {
        display: grid;
        height: calc(100% - 200px);
        width: 100%;
        grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
        grid-template-rows: 200px 1fr 300px;
      }
      .titlepagesection[data-position="tl"] {
        grid-column-start: 1;
        grid-column-end: 3;
      }
      .titlepagesection[data-position="tc"] {
        grid-column-start: 3;
        grid-column-end: 5;
        text-align: center;
      }
      .titlepagesection[data-position="tr"] {
        grid-column-start: 5;
        grid-column-end: 7;
        text-align: right;
      }
      .titlepagesection[data-position="cc"] {
        grid-column-start: 1;
        grid-column-end: 7;
        text-align: center;
        align-self: center;
      }
      .titlepagesection[data-position="bl"] {
        grid-column-start: 1;
        grid-column-end: 4;
        align-self: end;
      }
      .titlepagesection[data-position="br"] {
        grid-column-start: 4;
        grid-column-end: 7;
        text-align: right;
        align-self: end;
      }

      .numberonleft h3:before {
        opacity: 0.4;
        content: attr(data-scenenumber);
        font-weight: 700;
        left: -45px;
        position: absolute;
      }

      .numberonright h3:after {
        opacity: 0.4;
        content: attr(data-scenenumber);
        font-weight: 700;
        right: -45px;
        position: absolute;
      }

      #workspace #script .page div.dialogue {
        margin-left: auto;
        margin-right: auto;
        width: 68%;
      }

      #workspace #script .page div.dialogue h4 {
        margin-bottom: 0;
        margin-left: 23%;
      }

      #workspace #script .page div.dialogue p.dialogue_parenthetical {
        margin-bottom: 0;
        margin-top: 0;
        margin-left: 11%;
      }

      #workspace #script .page div.dialogue p {
        margin-bottom: 0;
        margin-top: 0;
      }

      #workspace #script .page div.dual-dialogue {
        margin: 2em 0 0.9em 2%;
        width: 95%;
      }

      #workspace #script .page div.dual-dialogue div.dialogue {
        display: inline-block;
        margin: 0;
        width: 45%;
      }

      #workspace #script .page div.dual-dialogue div.dialogue h4 {
        margin-top: 0;
      }

      #workspace #script .page div.dual-dialogue div.dialogue.right {
        float: right;
      }

      #workspace #script .page span.centered {
        text-align: center;
        width: 92.5%;
        display: block;
      }

      #workspace #script .page p.section {
        opacity: 0.2;
        margin-left: -30px;
      }

      #workspace #script .page p.synopsis {
        opacity: 0.4;
        margin-left: -20px;
        font-style: italic;
      }

      #workspace #script .page span.italic {
        font-style: italic;
      }

      #workspace #script .page span.bold {
        font-weight: 700;
      }

      .page h3 {
        font-weight: bold;
      }

      .note {
        opacity: 0.5;
        font-style: italic;
      }

      .underline {
        text-decoration: underline;
      }

      #titlepage_container {
        display: block;
      }
      #titlepage_container.hidden {
        display: none;
      }
      #screenplay_page {
        height: auto !important;
      }

      .header {
        position: absolute;
        top: 48px;
      }
      .footer {
        position: absolute;
        bottom: 48px;
      }
    </style>
  </head>
  <body id="sparkdown-js">
    <section id="workspace" style="display: block">
      <div id="script" class="a4 dpi100">
        <div class="page $TITLEDISPLAY$" id="titlepage_container">
          <div id="titlepage" class="innerpage title-page">$TITLEPAGE$</div>
        </div>
        <div id="screenplay_page" class="page">
          <div id="mainpage" class="$SCRIPTCLASS$">$SCREENPLAY$</div>
        </div>
      </div>
    </section>
  </body>
</html>
`;
