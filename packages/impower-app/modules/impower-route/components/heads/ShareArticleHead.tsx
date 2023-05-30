import Head from "next/head";
import React from "react";

interface ShareArticleHeadProps {
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  twitterCardType?: "summary" | "summary_large_image" | "app";
}

export const ShareArticleHead = React.memo(
  (props: ShareArticleHeadProps): JSX.Element => {
    const {
      author,
      publishedTime,
      modifiedTime,
      section,
      tags,
      title,
      description,
      url,
      image = `${process.env.NEXT_PUBLIC_ORIGIN || ""}/og.png`,
      twitterCardType = "summary_large_image",
    } = props;

    const twitterSite = `@impowergames`;

    return (
      <Head>
        <meta property="og:site_name" content="Impower Games" />
        <meta property="og:type" key="og:type" content="article" />
        <meta property="article:author" key="article:author" content={author} />
        <meta
          property="article:published_time"
          key="article:published_time"
          content={publishedTime}
        />
        <meta
          property="article:modified_time"
          key="article:modified_time"
          content={modifiedTime}
        />
        <meta
          property="article:section"
          key="article:section"
          content={section}
        />
        {tags?.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
        <meta property="og:title" key="og:title" content={title} />
        <meta
          property="og:description"
          key="og:description"
          content={description}
        />
        <meta property="og:url" key="og:url" content={url} />
        <meta property="og:image" key="og:image" content={image} />

        <meta
          name="twitter:card"
          key="twitter:card"
          content={twitterCardType}
        />
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
          content={`@${author}`}
        />
        <meta name="twitter:site" key="twitter:site" content={twitterSite} />
      </Head>
    );
  }
);

export default ShareArticleHead;
