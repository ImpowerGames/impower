import Head from "next/head";
import React from "react";

interface PageHeadProps {
  title: string;
}

export const PageHead = React.memo((props: PageHeadProps): JSX.Element => {
  const { title } = props;
  return (
    <Head>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover"
      />
    </Head>
  );
});

export default PageHead;
