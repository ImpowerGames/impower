export const STATIC_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    $FONTS$
    $CSS$
  </head>
  <body>
    <section id="workskin">
      <div id="script">
        $TITLEPAGE$
        $MAINPAGE$
      </div>
    </section>
  </body>
</html>
`.trim();
