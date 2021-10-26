import Head from "next/head";
import React from "react";

export const ShareWebsiteHead = React.memo((): JSX.Element => {
  const title = "Impower Games";
  const description = "Create games together.";
  const url = process.env.NEXT_PUBLIC_ORIGIN || "www.impower.app";
  const image = `${url}/og.png`;
  const twitterCreator = `@impowergames`;
  const twitterSite = `@impowergames`;
  const twitterCardType = "summary_large_image";

  return (
    <Head>
      <meta property="og:site_name" content="Impower Games" />
      <meta property="og:type" key="og:type" content="website" />
      <meta property="og:title" key="og:title" content={title} />
      <meta
        property="og:description"
        key="og:description"
        content={description}
      />
      <meta property="og:url" key="og:url" content={url} />
      <meta property="og:image" key="og:image" content={image} />

      <meta name="twitter:card" key="twitter:card" content={twitterCardType} />
      <meta name="twitter:title" key="twitter:title" content={title} />
      <meta
        name="twitter:description"
        key="twitter:description"
        content={description}
      />
      <meta name="twitter:url" key="twitter:url" content={url} />
      <meta name="twitter:image" key="twitter:image" content={image} />
      <meta
        name="twitter:creator"
        key="twitter:creator"
        content={twitterCreator}
      />
      <meta name="twitter:site" key="twitter:site" content={twitterSite} />
    </Head>
  );
});

export default ShareWebsiteHead;
