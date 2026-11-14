# Who the ask-maintainer tool acts as

The tool acts on GitHub as its own GitHub App, so GitHub alerts the maintainer when a request is assigned and their answers can be told apart from the tool's. Every command signs a short-lived token for the App's installation and uses it for every call it makes: filing, editing, labels, assignment, dependencies and comments. The token covers read and write access to issues on the tickets repository and nothing else. The App's slug, App id and installation id are `maintainer.app` in `.agents/repos.json`, all `null` until the App exists. Its private key stays outside every repository; the environment variable `ASK_MAINTAINER_APP_KEY` holds the key file's absolute path.

## The key

The tool refuses to run when `ASK_MAINTAINER_APP_KEY` is set but does not hold an absolute path (the key pasted in its place, for one), or names an unreadable file, a file that is not an RSA private key in PEM form, or a file inside a Git repository, in its work tree or its `.git` folder, directly or through a symlink. It also refuses when Git cannot tell whether the file is inside a repository. The error names the variable and never repeats its value or quotes the key.

## Without the App

On a machine without the key (the variable unset), with no App configured, or when GitHub refuses the token request or cannot be reached, the tool files through the maintainer's own account and says why in its output. Each request then ends with a visible line saying an agent filed it through the maintainer's account and that GitHub sends no alert for it. Each comment the tool posts carries a visible line saying the tool posted it. `node .agents/skills/ask-maintainer/maintainer-request.mjs identity` prints who the tool acts as on this machine and, in the fallback, why.

## Whose a comment is

The tool marks every body and comment it writes with the hidden line `<!-- ask-maintainer: posted by the tool -->`. `commentAuthor` and `actorOf` in `github-app.mjs` decide whose a comment or close is, and the rule is the same with or without the App. A comment or close by the App is the tool's. A maintainer-login comment that carries the mark on a line of its own is also the tool's. Any other comment or close by the maintainer's login is the maintainer's. Code that reads answers uses these functions rather than comparing logins itself.

## Set up the App

The maintainer does this once, then saves the key on each machine that runs agents:

1. Create a GitHub App owned by the ImpowerGames organization, with no webhook, no callback URL, and one repository permission: Issues, read and write.
2. Install it on the tickets repository only.
3. Put its slug (from its `github.com/apps/<slug>` address), its App id (from its settings page) and its installation id (the number at the end of the installation's settings address) in `maintainer.app` in `.agents/repos.json`.
4. Generate a private key from the App's settings page, save it outside every repository, and set `ASK_MAINTAINER_APP_KEY` to the key file's absolute path in the environment agents start with.
5. Run `node .agents/skills/ask-maintainer/maintainer-request.mjs identity`. With the key in place it prints `Acting as the GitHub App <slug>[bot].`; otherwise it gives the reason it acts through the maintainer's account.
