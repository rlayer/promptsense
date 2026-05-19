import type { ModelListStatus, ModelOption, ProviderAdapter, ProviderId } from "../types";

/** Props for provider, model, key, and sampling controls. */
interface ProviderControlsProps {
  /** All providers available for selection. */
  providers: ProviderAdapter[];

  /** Currently selected provider. */
  provider: ProviderAdapter;

  /** Model options exposed by the selected provider. */
  modelOptions: ModelOption[];

  /** Current provider model discovery status. */
  modelListStatus: ModelListStatus;

  /** User-facing model discovery error, if fallback models are being used. */
  modelListError: string | null;

  /** Currently selected model id or the custom sentinel. */
  selectedModel: string;

  /** User-entered model id when custom mode is active. */
  customModel: string;

  /** API key value for the selected provider. */
  apiKey: string;

  /** Whether to persist the key for this browser session. */
  rememberKey: boolean;

  /** Sampling temperature for the first structured analysis pass. */
  temperature: number;

  /** Called when the selected provider changes. */
  onProviderChange(providerId: ProviderId): void;

  /** Called when the selected model changes. */
  onModelChange(model: string): void;

  /** Called when the custom model id changes. */
  onCustomModelChange(model: string): void;

  /** Called when the provider API key changes. */
  onApiKeyChange(apiKey: string): void;

  /** Called when session key persistence changes. */
  onRememberKeyChange(remember: boolean): void;

  /** Called when the sampling temperature changes. */
  onTemperatureChange(temperature: number): void;
}

/** Control strip for choosing provider settings before live analysis runs. */
export function ProviderControls({
  providers,
  provider,
  modelOptions,
  modelListStatus,
  modelListError,
  selectedModel,
  customModel,
  apiKey,
  rememberKey,
  temperature,
  onProviderChange,
  onModelChange,
  onCustomModelChange,
  onApiKeyChange,
  onRememberKeyChange,
  onTemperatureChange
}: ProviderControlsProps) {
  return (
    <section className="panel controls-panel" aria-label="Model controls">
      <label className="control-field provider-field">
        <span className="control-label">Provider</span>
        <select
          value={provider.id}
          onChange={(event) => onProviderChange(event.target.value as ProviderId)}
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="control-field model-field">
        <span className="control-label">Model</span>
        <select
          value={selectedModel}
          title={modelListTitle(modelListStatus, modelListError)}
          onChange={(event) => onModelChange(event.target.value)}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
          <option value="custom">Custom model id</option>
        </select>
      </label>

      {selectedModel === "custom" ? (
        <label className="control-field custom-model-field">
          <span className="control-label">Custom id</span>
          <input
            value={customModel}
            onChange={(event) => onCustomModelChange(event.target.value)}
            placeholder="provider-model-id"
          />
        </label>
      ) : null}

      <label className="control-field temperature-field">
        <span className="control-field-header">
          <span className="control-label">Temperature</span>
          <strong>{temperature.toFixed(1)}</strong>
        </span>
        <input
          className="temperature-slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={temperature}
          onChange={(event) => onTemperatureChange(Number(event.target.value))}
        />
      </label>

      {provider.requiresApiKey ? (
        <>
          <label className="control-field api-key-field">
            <span className="control-label">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={`${provider.label} key`}
              autoComplete="off"
            />
          </label>
          <label className="remember-toggle">
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(event) => onRememberKeyChange(event.target.checked)}
            />
            <span className="remember-check" aria-hidden="true" />
            <span className="remember-copy">
              Remember
              <small>For this browser session</small>
            </span>
          </label>
        </>
      ) : (
        <div className="demo-pill">Demo mode</div>
      )}
    </section>
  );
}

/** Returns tooltip copy for the model selector's discovery state. */
function modelListTitle(status: ModelListStatus, error: string | null): string {
  if (status === "loading") {
    return "Loading models from the provider API.";
  }
  if (status === "live") {
    return "Models loaded from the provider API.";
  }
  if (status === "error" && error) {
    return `Using fallback models. ${error}`;
  }
  return "Using fallback models.";
}
