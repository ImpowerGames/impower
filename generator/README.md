# Impower Title Generator

These are the generator scripts that we use for our A.I.-powered random title generators.

---

## How The Title Generator Works

1. The title generator first takes a list of tags that represent a concept (e.g. ["legal", "demon"]).
2. It then checks a `terms.json` file for any terms that are related to those tags (e.g. ["advocate", "devil"]).
3. Then it scans `phrases.json` for any common English phrases that contain any of those related terms (e.g. "Devil's Advocate").
4. And finally, it suggests these phrases to the user!

Phrases are ranked by a basic relevancy algorithm (more info on this algorithm can be found in the `Impower Relevancy Algorithm` section of this README)

Relevancy is generally determined by...

1. How many tags the phrase is related to (the more relevant double-entendres it has, the higher the rank).
2. How specific those related tags are (specific tags like "vampire" are weighted much more heavily than more general tags like "conversation")
3. How short the phrase is (shorter phrases are ranked higher than longer ones)

---

## Important Files

These scripts take a `phrases.json` file and a `tagTerms.json` file as input to generate a `terms.json` file.

- The `phrases.json` file is a list of common english phrases (idioms, catchphrases, slogans, etc.)

```json
[
  "An Axe to Grind",
  "Ball And Chain",
  "Caught Off Guard",
  "Dog And Pony Show",
  "Exposure Therapy"
]
```

- The `tagTerms.json` file is a map of tags (genres, aesthetics, subjects, etc.) and terms related to those tags.

```json
{
  "vampire": [
    "bat_",
    "blood",
    "cloak",
    "coffin",
    "cross",
    "fang",
    "stake",
    "suck",
    "throat",
    "undying",
    "vampire"
  ],
  "vehicle": [
    "_green light_",
    "_red light_",
    "belt",
    "brake",
    "bus",
    "cab",
    "car_",
    "pedal",
    "street",
    "wheel"
  ],
  "victorian": [">regency", "telegram", "telegraph", "zeppelin"]
}
```

- The `terms.json` file is a map of subphrases extracted from the `phrases.json` list and tags related to each subphrase according to the `tagTerms.json` map.

```json
{
  "don't": ["rivals"],
  "divided": ["rivals"],
  "brazen": ["rivals"],
  "angry": ["rivals"],
  "not like": ["rivals"],
  "don't like": ["rivals"],
  "homesick": ["reunion"],
  "homecoming": ["reunion"],
  "hi": ["reunion"],
  "hello": ["reunion"],
  "people's": ["rebellion"],
  "in your place": ["rebellion"]
}
```

The `phrases.json` and `terms.json` files are then loaded as remote configs in our Firebase app and used to populate our title generator.

---

## Getting Started (First-Time Setup)

1. Open the generator folder: `cd generator`
2. Install dependencies: `npm install`

---

## Updating the A.I.

To adjust the "brain" of the phrase suggester A.I., you can edit the `tagTerms.json` file. (This file contains a map of all our app's tags, and terms that are related to those tags):

1. Open `src/input/tagTerms.json`
2. Adjust the terms array for any tag.

To change which phrases can be suggested to the user, edit the `phrases.json` list:

1. Open `src/input/phrases.json`
2. Add, remove, or edit any phrases in the phrase list.

---

## Impower Tag Terms Syntax

You can use several special characters in the `tagTerms.json` file in order to make the process of assembling a related terms list a bit easier.

`>` Recursive Spread

- `>autoIncludeAllTermsInThisReferencedTag` (When a tag is included in a term list and prefixed with the carat > symbol, that is the equivalent of including every term in that tag's term list in this tag's term list as well)

---

`_` Forbid Auto-Prefix/Suffix

- `dontAutoSuffix_` (e.g. including the term "appear" would normally auto-include the words "appears", "appeared", "appearing", etc. This underscore tells the generator not to do that for this term)

- `_dontAutoPrefix` (e.g. including the term "appear" would normally auto-include the words "disappear", "reappear", etc. This underscore tells the generator not to do that for this term)

- `_dontAutoPrefixOrSuffix_` (don't auto-include prefixed or suffixed versions of the term. Only include words that match the term exactly.)

---

`~` Force Auto-Prefix/Suffix

- `_will suffix~ a word_` (terms with multiple words aren't normally auto-suffixed, but you can append ~ to a word in the term to include all suffixed versions of that word)

- `_will ~prefix a word_` (terms with multiple words aren't normally auto-prefixed, but you can prepend ~ to a word in the term to include all prefixed versions of that word)

- `_will ~prefixAndSuffix~ a word_` (terms with multiple words aren't normally auto-prefixed, but you can prepend and append ~ to a word in the term to include all prefixed and suffixed versions of that word)

---

`*NEG` and `*POS` Sentiment

- `*NEG onlyIncludeTermIfNegated` (e.g. for the term "like", it will only include phrases containing the term, if the term in the phrase is negated with another word: e.g. "don't like", "won't like", "can't like" etc. This is mostly useful for negative relationship tags like "Rivals" or "Revenge")

- `*POS onlyIncludeTermIfPositive` (e.g. for the term "like", it will only include phrases containing the term, if the term in the phrase has NOT been negated with another word: e.g. "i like", "do like", "i really like" etc. This is mostly useful for positive relationship tags like "Dating", "Friendship", or "Romance")

---

## Using Word2Vec To Discover Even More Related Terms

[Word2Vec](https://en.wikipedia.org/wiki/Word2vec) is a technique for natural language processing published by Google. The word2vec algorithm uses a neural network model to learn word associations from a large corpus of text.

We utilized this pre-trained word2vec model to help populate our original related terms arrays:
https://dl.fbaipublicfiles.com/fasttext/vectors-wiki/wiki.en.vec

But any word2vec model with an adequate vocabulary should suffice for this purpose.

1. Download an [English pre-trained word2vec text model](https://fasttext.cc/docs/en/pretrained-vectors.html)
2. Save the model in `src/data/wiki.en.vec`
3. Use `npm run keywords` to generate a list of keywords found in the `phrases.json` file
4. Use `npm run vector` to generate a map of vectors for those keywords.
5. Use `npm run related` to generate a list of terms that you may want to add to your `tagTerms.json` file

---

## Impower Relevancy Algorithm

Using the `phrases.json` and `terms.json` files, you can generate the map `relatedPhrasesSortedByLength`. To do so, simply:

1. Break down each phrase in `phrases.json` into all possible subphrases.
2. Use `terms.json` to check if any of those subphrases appear in a tag's related terms.
3. If so, add the original phrase to a map of (tags) -> (phrases related to this tag).
4. Sort each tag's related phrase list by length in ascending order (shortest to longest).

We then pass this `relatedPhrasesSortedByLength` map along with an array of `tagsSortedBySpecificity` into a ranking algorithm. This algorithm uses these inputs to rank and select the most relevant phrases to suggest to the user.
