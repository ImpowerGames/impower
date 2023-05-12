# Impower Concept Generator

These are the generator scripts that we use for our A.I.-powered random concept generators.

---

## How Our Concept Generators Work

1. A concept generator takes a list of tags that represent a concept (e.g. ["legal", "demon"])
2. Checks a `terms.json` file for any terms that are related to those tags (e.g. ["advocate", "devil"])
3. Scans `phrases.txt` for any common English phrases that contain any of those related terms (e.g. "Devil's Advocate")
4. And finally, suggests these phrases to the user!

Phrases are ranked by a basic relevancy algorithm (more info on this algorithm can be found in the section titled `Impower Relevancy Algorithm`)

In general terms, relevancy is determined by...

1. How many tags the phrase is related to (the more relevant double-entendres it has, the higher it is ranked).
2. How specific those related tags are (specific tags like "vampire" are weighted much more heavily than more general tags like "conversation")
3. How short the phrase is (shorter phrases are ranked higher than longer ones)

---

## Important Files

The scripts in this repo take the user-created configuration files (`concepts.yaml` and `phrases.txt`) and use them to output a condensed json file (`terms.json`) that can be used by a concept generator. 

- The `phrases.txt` file contains a list of common english phrases (idioms, catchphrases, slogans, etc.)

  ```yaml
  - An Axe to Grind
  - Ball And Chain
  - Caught Off Guard
  - Dog And Pony Show
  - Exposure Therapy
  ```

- The `concepts.yaml` file contains a map of concepts (genres, aesthetics, subjects, etc.) and terms related to those concepts.

  ```yaml
  vampire:
  - bat_
  - blood
  - cloak
  - coffin
  - cross
  - fang
  - stake
  - suck
  - throat
  - undying
  - vampire
  vehicle:
  - _green light_
  - _red light_
  - belt
  - brake
  - bus
  - cab
  - car_
  - pedal
  - street
  - wheel
  victorian:
  - ^regency
  - telegram
  - telegraph
  - zeppelin
  ```

- The `terms.json` file contains a map of subphrases extracted from the `phrases.txt` list and words related to each subphrase according to the `concepts.yaml` map.

  ```json
  {
    "don't": ["rival"],
    "divided": ["rival"],
    "brazen": ["rival"],
    "angry": ["rival"],
    "not like": ["rival"],
    "don't like": ["rival"],
    "homesick": ["reunion"],
    "homecoming": ["reunion"],
    "hi": ["reunion"],
    "hello": ["reunion"],
    "people's": ["rebellion"],
    "in your place": ["rebellion"]
  }
  ```

Impower loads the `phrases.txt` and `terms.json` files as remote configs in our Firebase app to populate our various concept generators.

---

## Getting Started (First-Time Setup)

1. Open the generator folder: `cd generator`
2. Install dependencies: `npm install`

---

## Configuring the A.I.

To adjust the "brain" of a concept generator, edit the `concepts.yaml` file. 

1. Open `src/input/concepts.yaml`
2. Edit the terms list for any concept.

To change which phrases can be suggested to the user, edit the `phrases.txt` list:

1. Open `src/input/phrases.txt`
2. Add, remove, or edit any phrases in the phrase list.

---

## Impower Concept Model Syntax

You can use several special characters in `concepts.yaml` to make the process of assembling related terms a bit easier.

1. Recursive Spread: `^` 

    Many concepts are simply combinations of smaller concepts.

    For example, we define `noir` as a combination of the following concepts: `crime`, `dark`, `detective`, and `mystery`.

    Since we already defined these concepts elsewhere in the yaml file, we can simply use the `^` caret symbol to include all the terms we listed for those concepts inside the current term list.

    ```yaml
    noir:
    - ^crime
    - ^dark
    - ^detective
    - ^mystery
    ```

    (The above configuration automatically includes all `crime`, `dark`, `detective`, and `mystery` terms inside the `noir` list as well.);

2. Forbid Auto-Prefix/Suffix: `_` 

    When you add a word to a term list, suffixed and prefixed variants of that word will be automatically included as part of the concept. 

    For example, adding the word "appear" also automatically includes suffixed variants like "appears", "appeared", "appearing", etc. and prefixed variants like "disappear", "reappear", etc.

    You can use `_` underscores to disable this behavior.

    ```yaml
    technology:
    - bit_
    - _cord
    - _count_
    ```

    (The above configuration prevents the words "bitter", "discord" and "discounted" from being automatically included in the `technology` term list.);

3. Force Auto-Prefix/Suffix: `~` 

    Terms that contain multiple words (e.g. phrases like `breaking and entering`) aren't automatically suffixed or prefixed. 

    You can use `~` tildes to forcibly include all versions of the phrase that contain valid prefixed or suffixed variants of that word.

    ```yaml
    steal:
    - _break~ and enter
    - _break~ in_
    - _get~ away_
    - _take~ that_
    - _take~ this_
    - _took that_
    - _took this_
    ```

    (The above configuration will implicitly include phrases like `breaking and entering` and `breaking in`. Notice that the past tense for `take` does not follow typical english suffix rules (`taked` is not a valid word). So `_took that_` and `_took this_` must be manually included inside the term list. See `./src/utils/getTermVariants.ts` for a list of common suffixes and prefixes that the parser will attempt to add to a word.)

4. Sentiment: `*NEG` and `*POS`

   For some concepts, it important for the generator to take contextual use into account.

   For example, for the concept `rival`, we only want to include the word `like` if it is used in a way in which carries a negative connotation. (e.g. `I don't like you`). To do this you can prefix the term with the sentiment prefix `*NEG `.

    ```yaml
    rival:
    - _*NEG like
    - _not to like_
    ```

    (With the above configuration, the concept generator will only match phrases including the term `like` if the term is negated with another word: e.g. "don't like", "won't like", "can't like" etc. This is mostly useful for negative relationship tags like "Rivals" or "Revenge")

    Conversely, you can use the `*POS` sentiment prefix to match phrases containing a term, only if the term in the phrase has NOT been negated with another word: e.g. "i like", "do like", "i really like" etc. This is mostly useful for positive relationship tags like "Dating", "Friendship", or "Romance"

    ```yaml
    love:
    - _*POS like
    - _*NEG say no
    ```

    (The above configuration will match phrases like `They really like me` and `Can't say no`.)
---

## Using Word2Vec To Discover Even More Related Terms

[Word2Vec](https://en.wikipedia.org/wiki/Word2vec) is a technique for natural language processing published by Google. The word2vec algorithm uses a neural network model to learn word associations from a large corpus of text.

We utilized this pre-trained word2vec model to help populate and train our original related term lists:
https://dl.fbaipublicfiles.com/fasttext/vectors-wiki/wiki.en.vec

But any word2vec model with a reasonably large vocabulary should suffice for this purpose.

1. Download an [English pre-trained word2vec text model](https://fasttext.cc/docs/en/pretrained-vectors.html)
2. Save the model in `models/wiki.en.vec`
3. Use `npm run keywords` to generate a list of keywords found in the `phrases.txt` file
4. Use `npm run vector` to generate a map of vectors for those keywords.
5. Use `npm run related` to generate a list of terms that you may want to add to your `concepts.yaml` file

---

## Impower Relevancy Algorithm

Using `phrases.txt` and `terms.json` as input files, our generators create a map of phrases that relate to a concept. To do so, we simply:

1. Break down each phrase in `phrases.txt` into all possible subphrases.
2. Use `terms.json` to check if any of those subphrases appear in a tag's related terms.
3. If so, add the original phrase to a map of (tags) -> (phrases related to this tag).
4. Sort each tag's related phrase list by length in ascending order (shortest to longest).

We then pass this `relatedPhrasesSortedByLength` map along with an array of `tagsSortedBySpecificity` into a ranking algorithm. This algorithm uses these inputs to rank and select the most relevant phrases to suggest to the user.

You can view the code for our relevancy algorithm in `./client/modules/impower-terms`.