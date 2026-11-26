# Contributing

Issues and pull requests are welcome, in English or Vietnamese. The most wanted help: a translation of the interface, and macOS or Linux support (the mod is only tested on Windows).

## Run the tests

You need Claude Code and Node on `PATH`. In your clone:

```powershell
claude plugin test .
claude plugin validate .
```

Both must pass before a pull request. The tests run the mod against a mocked engine: they never touch your real sessions or files.

## Try a change

Running sessions reload the mod each time one of its files is saved. Keep the clone you edit apart from the one in `~/.claude/mods/dai-chi-huy`, and point `CLAUDE_CODE_PLUGIN_DIRS` at it only to try a finished change in a new session.

## Add a language

Every text the mod shows comes from `locales/<code>.mjs`.

1. Copy `locales/en.mjs` to `locales/<code>.mjs`, with a two-letter code (`ja`, `ko`, `zh`, `es`, `pt`, `de`, `fr`, `id`, ...).
2. Translate every text. Keep each `{placeholder}`, the name Đài Chỉ Huy and the symbols (⏻ 🧹 ⓘ) as they are.
3. Add the file to `LOCALES` in `locales/index.mjs`, and its code to the `language` options in `.claude-plugin/plugin.json`.
4. Run the tests. `hooks/locales.test.tsx` checks that the new file has every text of `en.mjs`, each with the same placeholders.
5. Try it: put `{ "pluginConfigs": { "dai-chi-huy": { "options": { "language": "<code>" } } } }` in `~/.claude/settings.json`, start a new session and run `/chihuy`.

Add a screenshot of the pane to the pull request. With `language` left on `auto`, the mod follows the system language, so people whose system is in your language get it with no setup.

## Pull requests

- One change per pull request, with a line on how you tested it.
- Keep personal data out of screenshots and logs: session names, folder paths, emails.
- By sending a pull request you agree that your work is released under the [MIT license](LICENSE).
