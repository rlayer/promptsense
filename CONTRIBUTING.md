# Contributing

Thanks for helping improve PromptSense.

## Development Setup

```bash
npm install
npm run dev
```

## Pull Request Guidelines

- Keep changes focused.
- Add or update tests for analysis, provider, or editor behavior.
- Do not commit API keys or real private prompts.
- Preserve the frontend-only architecture unless a proposal explicitly changes it.

## Design Principles

- API keys are user-provided and never bundled.
- Provider responses are normalized into the shared impact result shape.
- Phrase highlighting should prefer exact matches and degrade gracefully.
- Demo mode should keep the app useful without provider credentials.
