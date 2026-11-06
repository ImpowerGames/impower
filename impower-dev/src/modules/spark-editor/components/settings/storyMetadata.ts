export const UNTITLED_STORY = "Untitled story";
export const AUTHOR_NOT_SET = "Not set";

const plain = (value: string): string =>
  value
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .replace(/(^|[\s(])(\*\*\*|___|\*\*|__|\*|_|~~|::|\^\^|`)(.+?)\2(?=$|[\s).,!?:;])/g, "$1$3")
    .replace(/\s+/g, " ")
    .trim();

const lines = (frontMatter: Readonly<Record<string, readonly string[]>>, keyword: string): string[] =>
  (Object.hasOwn(frontMatter, keyword) ? frontMatter[keyword]! : []).map(plain).filter(Boolean);

export interface StoryMetadata {
  readonly title: string;
  readonly author: string;
}

export const storyMetadata = (
  frontMatter: Readonly<Record<string, readonly string[]>>,
): StoryMetadata => ({
  title: lines(frontMatter, "title").join("\n") || UNTITLED_STORY,
  author: lines(frontMatter, "author").join(" ") || AUTHOR_NOT_SET,
});
