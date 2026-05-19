# PromptSense

<img width="1254" height="1254" alt="image" src="https://github.com/user-attachments/assets/db00a79b-dedf-4cf9-b0a9-9fdffea07777" />


PromptSense is a frontend-only TypeScript app for live prompt impact analysis.

Paste a prompt, create a checkpoint, edit the prompt, and PromptSense compares
the current prompt against that checkpoint. It asks the selected model which
prompt phrases may be affected, then shows a checkpoint diff, phrase-level
highlights, impact score, insight cards, side effects, and suggested checks.

<img width="1031" height="718" alt="image" src="https://github.com/user-attachments/assets/e7552637-a198-49e8-9db4-bdb3a8297f2d" />


## Workflow

1. Paste or load a prompt.
2. Click `Create checkpoint` to set the comparison baseline.
3. Edit the prompt. The checkpoint/current diff stays visible and updates
   without shifting the workspace.
4. Review highlighted phrases, impact summary, insight cards, and checks.
5. Use `Reset to checkpoint` to restore the baseline, or `Clear` to clear both
   the editable prompt and checkpoint comparison.

## Why Frontend Only

PromptSense does not run a backend or proxy. Users bring their own provider API
key in the browser. Keys are kept in memory by default and can optionally be
remembered for the current browser session.

Direct browser calls expose the key to the local browser session. Use restricted
keys and avoid pasting private prompts into untrusted environments.

## Providers

- OpenAI via the Responses API
- Anthropic via the Messages API
- Google Gemini via the Generate Content API
- Demo mode with deterministic mocked analysis

Model ids are editable so the app can keep working as provider catalogs change.

## Local Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
npm run build
```

## Features

- Manual checkpoints for comparing a prompt before and after edits.
- Always-visible checkpoint/current diff panes.
- Local changed-excerpt extraction so the full checkpoint prompt is not sent on
  every live request.
- Provider adapters for OpenAI, Anthropic, Google Gemini.
- Structured impact analysis with severity, confidence, side effects, and
  recommended checks.
- Phrase-level prompt highlights mapped with exact matching first, then fuzzy
  matching with reduced confidence.

See [docs/architecture.md](docs/architecture.md) for the data flow, provider
contract, and fallback behavior.

## License

MIT. See [LICENSE](LICENSE).
