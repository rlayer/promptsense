export interface PromptFixture {
  id: string;
  label: string;
  baseline: string;
  current: string;
}

export const PROMPT_FIXTURES: PromptFixture[] = [
  {
    id: "output-schema",
    label: "Output schema",
    baseline: `# Role
You are a support triage assistant.

# Output Format
Return JSON with these keys:
- summary
- category
- priority

# Parser Contract
Downstream systems parse the JSON keys exactly.

# Examples
Customer: I cannot log in.
Assistant: {"summary":"Login issue","category":"account_access","priority":"high"}`,
    current: `# Role
You are a support triage assistant.

# Output Format
Return JSON with these keys:
- summary
- category
- priority
- severity

# Parser Contract
Downstream systems parse the JSON keys exactly.

# Examples
Customer: I cannot log in.
Assistant: {"summary":"Login issue","category":"account_access","priority":"high"}`
  },
  {
    id: "safety-rule",
    label: "Safety rule",
    baseline: `# Role
You answer account support questions.

# Safety
Never reveal passwords or API keys.

# Tool Use
Use the account_lookup tool only after the user verifies ownership.

# Refusal Example
If a user asks for another customer's account, refuse briefly.`,
    current: `# Role
You answer account support questions.

# Safety
Never reveal passwords, API keys, secrets, or private customer data.

# Tool Use
Use the account_lookup tool only after the user verifies ownership.

# Refusal Example
If a user asks for another customer's account, refuse briefly.`
  },
  {
    id: "tone-only",
    label: "Tone only",
    baseline: `# Role
You summarize product feedback.

# Tone
Be concise and formal.

# Output
Return three bullets with the top customer themes.`,
    current: `# Role
You summarize product feedback.

# Tone
Be warm, concise, and practical.

# Output
Return three bullets with the top customer themes.`
  }
];

