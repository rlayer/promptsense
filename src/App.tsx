import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractChangedExcerpts } from "./analysis/diff";
import { mapImpactToSpans } from "./analysis/spans";
import { InsightsPanel } from "./components/InsightsPanel";
import { PromptDiffPreview } from "./components/PromptDiffPreview";
import { PromptEditor } from "./components/PromptEditor";
import { ProviderControls } from "./components/ProviderControls";
import { PROMPT_FIXTURES } from "./fixtures/examples";
import { providerErrorMessage } from "./providers/errors";
import { getProvider, PROVIDERS } from "./providers";
import type {
  AnalysisStatus,
  HighlightCategory,
  HighlightSpan,
  ModelListStatus,
  ModelOption,
  PromptImpactResult,
  ProviderId
} from "./types";

const SESSION_KEY_PREFIX = "promptsense.apiKey.";
const SESSION_DEFAULT_PROVIDER_KEY = "promptsense.defaultProvider";
const DEFAULT_FIXTURE = PROMPT_FIXTURES[0];
const ANALYSIS_DEBOUNCE_MS = 350;
const MODEL_LIST_DEBOUNCE_MS = 450;
const HIGHLIGHT_LEGEND_ORDER: HighlightCategory[] = ["changed", "direct", "indirect", "no-impact"];
const HIGHLIGHT_LEGEND_LABELS: Record<HighlightCategory, string> = {
  changed: "Changed",
  direct: "Direct",
  indirect: "Indirect",
  "no-impact": "No obvious impact"
};
const HIGHLIGHT_LEGEND_DESCRIPTIONS: Record<HighlightCategory, string> = {
  changed: "Text that was edited since the checkpoint.",
  direct: "Prompt text likely affected by the edit.",
  indirect: "Prompt text that may be affected through downstream behavior.",
  "no-impact": "Prompt text the analysis found but does not expect to change behavior."
};

/** Main application shell that coordinates prompt editing and live analysis. */
export default function App() {
  const [providerId, setProviderId] = useState<ProviderId>(() => readSessionDefaultProvider());
  const provider = useMemo(() => getProvider(providerId), [providerId]);
  const [modelOptionsByProvider, setModelOptionsByProvider] = useState<
    Record<ProviderId, ModelOption[]>
  >(() => readFallbackModelOptions());
  const modelOptions = modelOptionsByProvider[providerId] ?? provider.fallbackModels;
  const [selectedModel, setSelectedModel] = useState(modelOptions[0]?.id ?? "custom");
  const [customModel, setCustomModel] = useState("");
  const [temperature, setTemperature] = useState(0.2);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => readSessionKeys());
  const [rememberKey, setRememberKey] = useState(() =>
    hasRememberedSessionKey(readSessionDefaultProvider())
  );
  const [modelListStatus, setModelListStatus] = useState<ModelListStatus>("fallback");
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_FIXTURE.current);
  const [checkpointPrompt, setCheckpointPrompt] = useState(DEFAULT_FIXTURE.baseline);
  const [checkpointLabel, setCheckpointLabel] = useState("Output schema fixture");
  const [result, setResult] = useState<PromptImpactResult | null>(null);
  const [spans, setSpans] = useState<HighlightSpan[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const resetAnalysis = useCallback(
    (nextStatus: AnalysisStatus = "ready", nextError: string | null = null) => {
      setResult(null);
      setSpans([]);
      setStatus(nextStatus);
      setError(nextError);
    },
    []
  );

  const activeModel = selectedModel === "custom" ? customModel.trim() : selectedModel;
  const activeApiKey = apiKeys[providerId] ?? "";
  const promptHasContent = prompt.trim().length > 0;
  const changedExcerpts = useMemo(
    () => extractChangedExcerpts(checkpointPrompt, prompt),
    [checkpointPrompt, prompt]
  );
  const activeChangedExcerpts = useMemo(
    () => (promptHasContent ? changedExcerpts : []),
    [changedExcerpts, promptHasContent]
  );
  const changedSectionLabel = formatChangedSectionCount(activeChangedExcerpts.length);
  const activeHighlightCategories = useMemo(() => {
    const usedCategories = new Set(spans.map((span) => span.category));
    return HIGHLIGHT_LEGEND_ORDER.filter((category) => usedCategories.has(category));
  }, [spans]);
  const promptStatusLabel = !promptHasContent
    ? "Prompt empty"
    : activeChangedExcerpts.length > 0
      ? changedSectionLabel
      : "Matches checkpoint";
  const modelCacheRef = useRef<Record<string, ModelOption[]>>({});

  useEffect(() => {
    setCustomModel("");
    setRememberKey(Boolean(sessionStorage.getItem(`${SESSION_KEY_PREFIX}${providerId}`)));
  }, [providerId]);

  useEffect(() => {
    if (selectedModel === "custom" || modelOptions.some((model) => model.id === selectedModel)) {
      return;
    }
    setSelectedModel(modelOptions[0]?.id ?? "custom");
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    setModelListError(null);

    if (provider.requiresApiKey && !activeApiKey.trim()) {
      setModelListStatus("fallback");
      setModelOptionsByProvider((current) => ({
        ...current,
        [providerId]: provider.fallbackModels
      }));
      return;
    }

    const cacheKey = modelCacheKey(providerId, provider.requiresApiKey, activeApiKey);
    const cachedModels = modelCacheRef.current[cacheKey];
    if (cachedModels) {
      setModelListStatus("live");
      setModelOptionsByProvider((current) => ({ ...current, [providerId]: cachedModels }));
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setModelListStatus("loading");
      try {
        const discoveredModels = await provider.listModels({
          apiKey: activeApiKey,
          signal: controller.signal
        });
        if (!isActive || controller.signal.aborted) {
          return;
        }

        const nextModels = discoveredModels.length > 0 ? discoveredModels : provider.fallbackModels;
        if (discoveredModels.length > 0) {
          modelCacheRef.current[cacheKey] = discoveredModels;
        }
        setModelOptionsByProvider((current) => ({ ...current, [providerId]: nextModels }));
        setModelListStatus(discoveredModels.length > 0 ? "live" : "fallback");
      } catch (caughtError) {
        if (!isActive || controller.signal.aborted) {
          return;
        }
        setModelOptionsByProvider((current) => ({
          ...current,
          [providerId]: provider.fallbackModels
        }));
        setModelListError(providerErrorMessage(provider.label, caughtError));
        setModelListStatus("error");
      }
    }, provider.requiresApiKey ? MODEL_LIST_DEBOUNCE_MS : 0);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeApiKey, provider, providerId]);

  useEffect(() => {
    if (rememberKey && activeApiKey) {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${providerId}`, activeApiKey);
      sessionStorage.setItem(SESSION_DEFAULT_PROVIDER_KEY, providerId);
      return;
    }

    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${providerId}`);
    if (sessionStorage.getItem(SESSION_DEFAULT_PROVIDER_KEY) === providerId) {
      sessionStorage.removeItem(SESSION_DEFAULT_PROVIDER_KEY);
    }
  }, [activeApiKey, providerId, rememberKey]);

  useEffect(() => {
    if (!checkpointPrompt) {
      resetAnalysis("idle");
      return;
    }

    if (!promptHasContent) {
      resetAnalysis("idle");
      return;
    }

    if (activeChangedExcerpts.length === 0) {
      resetAnalysis();
      return;
    }

    if (provider.requiresApiKey && !activeApiKey.trim()) {
      resetAnalysis("ready", `${provider.label} API key is required for live analysis.`);
      return;
    }

    if (!activeModel) {
      resetAnalysis("ready", "Select or enter a model id.");
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("analyzing");
      setError(null);
      try {
        const nextResult = await provider.analyzePromptChange({
          baselinePrompt: checkpointPrompt,
          currentPrompt: prompt,
          changedExcerpts: activeChangedExcerpts,
          model: activeModel,
          apiKey: activeApiKey,
          temperature,
          signal: controller.signal
        });
        if (!isActive || controller.signal.aborted) {
          return;
        }
        setResult(nextResult);
        setSpans(mapImpactToSpans(prompt, nextResult));
        setStatus("complete");
      } catch (caughtError) {
        if (!isActive || controller.signal.aborted) {
          return;
        }
        setError(providerErrorMessage(provider.label, caughtError));
        setStatus("error");
      }
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    activeApiKey,
    activeModel,
    activeChangedExcerpts,
    checkpointPrompt,
    prompt,
    promptHasContent,
    provider,
    resetAnalysis,
    temperature
  ]);

  /** Switches providers and resets dependent model/key UI state. */
  function handleProviderChange(nextProviderId: ProviderId) {
    const nextProvider = getProvider(nextProviderId);
    const nextModelOptions = modelOptionsByProvider[nextProviderId] ?? nextProvider.fallbackModels;
    setProviderId(nextProviderId);
    setSelectedModel(nextModelOptions[0]?.id ?? "custom");
    setCustomModel("");
    setRememberKey(hasRememberedSessionKey(nextProviderId));
    resetAnalysis();
  }

  /** Stores the API key value for the active provider. */
  function handleApiKeyChange(apiKey: string) {
    setApiKeys((current) => ({ ...current, [providerId]: apiKey }));
  }

  /** Applies editor text changes and clears stale analysis immediately. */
  function handlePromptChange(nextPrompt: string) {
    if (nextPrompt === prompt) {
      return;
    }
    setPrompt(nextPrompt);
    resetAnalysis(nextPrompt.trim() ? "ready" : "idle");
  }

  /** Promotes the current prompt to the checkpoint baseline. */
  function handleCreateCheckpoint() {
    setCheckpointPrompt(prompt);
    setCheckpointLabel("Manual checkpoint");
    resetAnalysis();
  }

  /** Restores the editor prompt from the current checkpoint. */
  function handleResetToCheckpoint() {
    setPrompt(checkpointPrompt);
    resetAnalysis();
  }

  /** Clears both the editor prompt and checkpoint comparison state. */
  function handleClearPrompt() {
    setPrompt("");
    setCheckpointPrompt("");
    setCheckpointLabel("No checkpoint");
    resetAnalysis("idle");
  }

  /** Loads a bundled example prompt pair into the editor and checkpoint. */
  function handleLoadFixture(fixtureId: string) {
    const fixture = PROMPT_FIXTURES.find((item) => item.id === fixtureId) ?? DEFAULT_FIXTURE;
    setPrompt(fixture.current);
    setCheckpointPrompt(fixture.baseline);
    setCheckpointLabel(fixture.label);
    resetAnalysis();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PromptSense</p>
          <h1>Live prompt impact analyzer</h1>
        </div>
        <div className="header-actions">
          <select
            aria-label="Load fixture"
            value=""
            onChange={(event) => handleLoadFixture(event.target.value)}
          >
            <option value="" disabled>
              Load example
            </option>
            {PROMPT_FIXTURES.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <ProviderControls
        providers={PROVIDERS}
        provider={provider}
        modelOptions={modelOptions}
        modelListStatus={modelListStatus}
        modelListError={modelListError}
        selectedModel={selectedModel}
        customModel={customModel}
        apiKey={activeApiKey}
        rememberKey={rememberKey}
        temperature={temperature}
        onProviderChange={handleProviderChange}
        onModelChange={setSelectedModel}
        onCustomModelChange={setCustomModel}
        onApiKeyChange={handleApiKeyChange}
        onRememberKeyChange={setRememberKey}
        onTemperatureChange={setTemperature}
      />

      <section className="checkpoint-bar" aria-label="Checkpoint controls">
        <div className="checkpoint-overview">
          <div>
            <span>Checkpoint</span>
            <strong>{checkpointLabel}</strong>
          </div>
          <div>
            <span>Changed sections</span>
            <strong>{changedSectionLabel}</strong>
          </div>
        </div>
        <div className="checkpoint-actions">
          <button type="button" onClick={handleCreateCheckpoint}>
            Create checkpoint
          </button>
          <button type="button" className="secondary-button" onClick={handleResetToCheckpoint}>
            Reset to checkpoint
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!prompt && !checkpointPrompt}
            onClick={handleClearPrompt}
          >
            Clear
          </button>
        </div>
      </section>

      <PromptDiffPreview
        baselinePrompt={checkpointPrompt}
        currentPrompt={prompt}
        changedExcerpts={activeChangedExcerpts}
        changedSectionLabel={changedSectionLabel}
      />

      <section className="workspace-grid">
        <div className="editor-panel panel">
          <div className="panel-heading">
            <h2>Prompt</h2>
            <div className="panel-heading-actions">
              {activeHighlightCategories.length > 0 ? (
                <div className="legend header-legend" aria-label="Prompt highlights legend">
                  {activeHighlightCategories.map((category) => (
                    <span
                      aria-label={`${HIGHLIGHT_LEGEND_LABELS[category]}: ${HIGHLIGHT_LEGEND_DESCRIPTIONS[category]}`}
                      className={`legend-item ${category}`}
                      key={category}
                      tabIndex={0}
                      title={HIGHLIGHT_LEGEND_DESCRIPTIONS[category]}
                    >
                      {HIGHLIGHT_LEGEND_LABELS[category]}
                    </span>
                  ))}
                </div>
              ) : null}
              <span>{promptStatusLabel}</span>
            </div>
          </div>
          <PromptEditor prompt={prompt} spans={spans} onChange={handlePromptChange} />
        </div>

        <InsightsPanel result={result} status={status} error={error} />
      </section>
    </main>
  );
}

/** Builds the initial provider-to-model map from static fallback models. */
function readFallbackModelOptions(): Record<ProviderId, ModelOption[]> {
  return Object.fromEntries(
    PROVIDERS.map((provider) => [provider.id, provider.fallbackModels])
  ) as Record<ProviderId, ModelOption[]>;
}

/** Reads the remembered provider choice, falling back to demo mode when unusable. */
function readSessionDefaultProvider(): ProviderId {
  if (typeof sessionStorage === "undefined") {
    return "mock";
  }

  const storedProviderId = sessionStorage.getItem(SESSION_DEFAULT_PROVIDER_KEY);
  if (!isProviderId(storedProviderId)) {
    return "mock";
  }

  const storedProvider = getProvider(storedProviderId);
  if (storedProvider.requiresApiKey && !hasRememberedSessionKey(storedProviderId)) {
    return "mock";
  }

  return storedProviderId;
}

/** Checks whether a provider has a session-scoped saved API key. */
function hasRememberedSessionKey(providerId: ProviderId): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  return Boolean(sessionStorage.getItem(`${SESSION_KEY_PREFIX}${providerId}`));
}

/** Narrows an arbitrary session value to a supported provider id. */
function isProviderId(value: string | null): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

/** Formats the changed-section count shown in the checkpoint controls. */
function formatChangedSectionCount(count: number): string {
  if (count === 0) {
    return "No changes";
  }
  if (count === 1) {
    return "1 changed section";
  }
  return `${count} changed sections`;
}

/** Creates the model-list cache key for a provider and optional API key. */
function modelCacheKey(providerId: ProviderId, requiresApiKey: boolean, apiKey: string): string {
  return requiresApiKey ? `${providerId}:${apiKey.trim()}` : providerId;
}

/** Reads all provider API keys remembered for this browser session. */
function readSessionKeys(): Record<string, string> {
  if (typeof sessionStorage === "undefined") {
    return {};
  }

  return PROVIDERS.reduce<Record<string, string>>((keys, provider) => {
    const value = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${provider.id}`);
    if (value) {
      keys[provider.id] = value;
    }
    return keys;
  }, {});
}
