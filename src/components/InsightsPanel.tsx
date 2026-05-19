import { calculateImpactScore } from "../analysis/impactScore";
import { MarkdownText } from "./MarkdownText";
import type { AnalysisStatus, PromptImpactResult, Severity } from "../types";

/** Props for the analysis results sidebar. */
interface InsightsPanelProps {
  /** Latest normalized analysis result, if one is available. */
  result: PromptImpactResult | null;

  /** Current analysis lifecycle status. */
  status: AnalysisStatus;

  /** User-facing provider or validation error. */
  error: string | null;
}

/** Props for the compact analysis status badge. */
interface StatusBadgeProps {
  /** Current analysis lifecycle status. */
  status: AnalysisStatus;

  /** Overall result severity shown after analysis completes. */
  severity?: Severity;
}

/** Sidebar that summarizes prompt-impact analysis, risks, and checks. */
export function InsightsPanel({ result, status, error }: InsightsPanelProps) {
  const impactScore = result ? calculateImpactScore(result) : null;

  return (
    <aside className="panel insights-panel" aria-label="Impact insights">
      <div className="panel-heading">
        <h2>Impact</h2>
        <StatusBadge status={status} severity={result?.overallSeverity} />
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {result ? (
        <>
          {impactScore !== null ? <ImpactScoreMeter score={impactScore} /> : null}
          <MarkdownText className="summary-text" text={result.summary} />
          <div className="insight-list">
            {result.insights.map((insight) => (
              <article key={insight.id} className={`insight severity-border-${insight.severity}`}>
                <div className="insight-meta">
                  <strong>{insight.severity}</strong>
                  <span>Confidence {Math.round(insight.confidence * 100)}%</span>
                </div>
                <h3>{insight.affectedPhrase || "Affected phrase"}</h3>
                <p>{insight.expectedSideEffect}</p>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>{insight.sourceChange || "Changed prompt text"}</dd>
                  </div>
                  <div>
                    <dt>Check</dt>
                    <dd>{insight.suggestedValidation}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          {result.recommendedChecks.length > 0 ? (
            <div className="checks">
              <h3>Checks</h3>
              <ul>
                {result.recommendedChecks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">Create a checkpoint and edit the prompt.</div>
      )}
    </aside>
  );
}

/** Horizontal meter that visualizes the aggregate impact score. */
function ImpactScoreMeter({ score }: { score: number }) {
  return (
    <div className="impact-score" aria-label="Total impact score">
      <div className="impact-score-header">
        <span>Total impact</span>
        <strong>{score}%</strong>
      </div>
      <div className="impact-score-track" aria-hidden="true">
        <span style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}



/** Small label that shows current status or final severity. */
function StatusBadge({ status, severity }: StatusBadgeProps) {
  const label = status === "complete" && severity ? severity : status;
  return <span className={`status-badge status-${status}`}>{label}</span>;
}
