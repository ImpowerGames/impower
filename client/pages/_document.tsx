import { EmotionCache } from "@emotion/react";
import createEmotionServer from "@emotion/server/create-instance";
import { AppPropsType, RenderPageResult } from "next/dist/shared/lib/utils";
import Document, {
  DocumentContext,
  DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document";
import { NextRouter } from "next/router";
import React from "react";
import createEmotionCache from "../lib/createEmotionCache";

export default class MyDocument extends Document {
  static override async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps> {
    // Resolution order
    //
    // On the server:
    // 1. app.getInitialProps
    // 2. page.getInitialProps
    // 3. document.getInitialProps
    // 4. app.render
    // 5. page.render
    // 6. document.render
    //
    // On the server with error:
    // 1. document.getInitialProps
    // 2. app.render
    // 3. page.render
    // 4. document.render
    //
    // On the client
    // 1. app.getInitialProps
    // 2. page.getInitialProps
    // 3. app.render
    // 4. page.render

    const originalRenderPage = ctx.renderPage;

    // You can consider sharing the same emotion cache between all the SSR requests to speed up performance.
    // However, be aware that it can have global side effects.
    const cache = createEmotionCache();
    const { extractCriticalToChunks } = createEmotionServer(cache);

    ctx.renderPage = (): RenderPageResult | Promise<RenderPageResult> =>
      originalRenderPage({
        enhanceApp:
          (
            App: React.ComponentType<
              AppPropsType<NextRouter> & { emotionCache?: EmotionCache }
            >
          ) =>
          (props): JSX.Element =>
            <App emotionCache={cache} {...props} />,
      });

    const initialProps = await Document.getInitialProps(ctx);
    // This is important. It prevents emotion to render invalid HTML.
    // See https://github.com/mui-org/material-ui/issues/26561#issuecomment-855286153
    const emotionStyles = extractCriticalToChunks(initialProps.html);
    const emotionStyleTags = emotionStyles.styles.map((style) => (
      <style
        data-emotion={`${style.key} ${style.ids.join(" ")}`}
        key={style.key}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: style.css }}
      />
    ));

    return {
      ...initialProps,
      // Styles fragment is rendered after the app and page rendering finish.
      styles: [
        ...React.Children.toArray(initialProps.styles),
        ...emotionStyleTags,
      ],
    };
  }

  override render(): JSX.Element {
    const title = `Impower Games`;
    const description = "Make games together.";
    return (
      <Html lang="en">
        <Head>
          {/* Step 5: Output the styles in the head  */}
          {this.props.styles}
          <link rel="icon" href="/favicon.ico" sizes="16x16" />

          <link
            rel="preload"
            href="/fonts/open-sans-v17-latin-regular.woff2"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            rel="preload"
            href="/fonts/open-sans-v17-latin-600.woff2"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            rel="preload"
            href="/fonts/open-sans-v17-latin-700.woff2"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            rel="preload"
            href="/fonts/roboto-slab-v12-latin-700.woff2"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/roboto-mono-v12-latin-400.woff2"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-italic.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-bold.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-bold-italic.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-sans.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-sans-italic.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-sans-bold.ttf"
            as="font"
            crossOrigin="anonymous"
          />
          <link
            href="/fonts/courier-prime-sans-bold-italic.ttf"
            as="font"
            crossOrigin="anonymous"
          />

          <link rel="stylesheet" href="/style.css" />

          <meta name="theme-color" key="theme-color" content="#FFFFFF" />
          <meta
            name="application-name"
            key="application-name"
            content={title}
          />
          <meta
            name="apple-mobile-web-app-capable"
            key="apple-mobile-web-app-capable"
            content="yes"
          />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            key="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <meta
            name="apple-mobile-web-app-title"
            key="apple-mobile-web-app-title"
            content={title}
          />
          <meta name="description" key="description" content={description} />
          <meta
            name="format-detection"
            key="format-detection"
            content="telephone=no"
          />
          <meta
            name="mobile-web-app-capable"
            key="mobile-web-app-capable"
            content="yes"
          />
          <meta
            name="msapplication-TileColor"
            key="msapplication-TileColor"
            content="#2B5797"
          />
          <meta
            name="msapplication-tap-highlight"
            key="msapplication-tap-highlight"
            content="no"
          />
          <link
            rel="apple-touch-icon"
            key="apple-touch-icon"
            sizes="192x192"
            href="/logo192.png"
          />
          <link rel="manifest" href="/manifest.json" />
          <link rel="shortcut icon" href="/favicon.ico" sizes="16x16" />
        </Head>
        <body>
          {/* script tag to fix FOUC */}
          <script>0</script>
          <Main />
          <NextScript />
          {/* Empty script tag as chrome bug fix, see https://stackoverflow.com/a/42969608/943337 */}
          <script> </script>
        </body>
      </Html>
    );
  }
}
