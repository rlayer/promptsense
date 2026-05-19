# Security Policy

PromptSense is a frontend-only app that calls model providers directly from the
browser with user-provided API keys.

## API Keys

- Keys are held in memory by default.
- The optional remember toggle stores keys in `sessionStorage` only.
- Never use unrestricted production keys in a public or shared browser.
- Do not include private prompts, customer data, or API keys in issues.
- Provider calls go directly to OpenAI, Anthropic, or Google Gemini from the
  browser.

## Reporting A Vulnerability

Open a private security advisory on GitHub if available. If that is not
available for your fork, contact the maintainers privately before publishing
details.
