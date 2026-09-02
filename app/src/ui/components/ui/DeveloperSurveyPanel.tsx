import { useMemo, useState } from 'react';
import type {
  DeveloperSurvey,
  DeveloperSurveyAnswers,
  DeveloperSurveyQuestion,
} from '../../../hooks/useDeveloperSurvey';
import type { I18nMessages } from '../../../i18n/messages';

interface DeveloperSurveyPanelProps {
  survey: DeveloperSurvey;
  answered: boolean;
  submitting: boolean;
  submitted: boolean;
  submitError: string;
  labels: I18nMessages['developerSurvey'];
  onSubmit: (answers: DeveloperSurveyAnswers) => Promise<boolean>;
}

type LocalAnswers = Record<string, string | string[]>;

function initialValue(q: DeveloperSurveyQuestion): string | string[] {
  return q.type === 'multiChoice' ? [] : '';
}

function isBlank(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
}

function validateAnswer(
  q: DeveloperSurveyQuestion,
  value: string | string[],
  labels: I18nMessages['developerSurvey'],
): string {
  if (q.required && isBlank(value)) return labels.requiredError;
  if (Array.isArray(value)) {
    const allowed = new Set(q.options.map((opt) => opt.id));
    return value.every((id) => allowed.has(id)) ? '' : labels.invalidOptionError;
  }
  if (q.type === 'singleChoice' && value) {
    const allowed = new Set(q.options.map((opt) => opt.id));
    if (!allowed.has(value)) return labels.invalidOptionError;
  }
  if ((q.type === 'text' || q.type === 'textarea') && value.length > q.maxLength) {
    return labels.maxLengthError(q.maxLength);
  }
  return '';
}

export function DeveloperSurveyPanel({
  survey,
  answered,
  submitting,
  submitted,
  submitError,
  labels,
  onSubmit,
}: DeveloperSurveyPanelProps) {
  const [answers, setAnswers] = useState<LocalAnswers>(() =>
    Object.fromEntries(survey.questions.map((q) => [q.id, initialValue(q)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const disabled = answered || submitted || submitting;
  const hasText = survey.description.trim().length > 0;

  const requiredMark = useMemo(
    () => <span className="p-developer-survey-required">{labels.required}</span>,
    [labels.required],
  );

  function setAnswer(id: string, value: string | string[]): void {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: '' }));
  }

  async function handleSubmit(): Promise<void> {
    const nextErrors: Record<string, string> = {};
    for (const q of survey.questions) {
      const err = validateAnswer(q, answers[q.id] ?? initialValue(q), labels);
      if (err) nextErrors[q.id] = err;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit(answers);
  }

  return (
    <section className="p-panel p-developer-survey-panel">
      <span className="p-panel-head p-developer-survey-head">
        <span>{survey.title}</span>
        {answered || submitted ? (
          <span className="p-developer-survey-status">{labels.answered}</span>
        ) : null}
      </span>
      <div className="p-panel-body p-developer-survey-body">
        {hasText ? <p className="p-developer-survey-description">{survey.description}</p> : null}
        {answered || submitted ? (
          <p className="p-developer-survey-success">{labels.thanks}</p>
        ) : (
          <>
            <div className="p-developer-survey-form">
              {survey.questions.map((q) => {
                const value = answers[q.id] ?? initialValue(q);
                const err = errors[q.id] ?? '';
                return (
                  <fieldset className="p-developer-survey-question" key={q.id} disabled={disabled}>
                    <legend>
                      <span>{q.label}</span>
                      {q.required ? requiredMark : null}
                    </legend>
                    {q.type === 'singleChoice' ? (
                      <div className="p-developer-survey-options">
                        {q.options.map((opt) => (
                          <label className="p-developer-survey-option" key={opt.id}>
                            <input
                              type="radio"
                              name={`developer-survey-${survey.id}-${q.id}`}
                              value={opt.id}
                              checked={value === opt.id}
                              onChange={() => setAnswer(q.id, opt.id)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {q.type === 'multiChoice' ? (
                      <div className="p-developer-survey-options">
                        {q.options.map((opt) => {
                          const checked = Array.isArray(value) && value.includes(opt.id);
                          return (
                            <label className="p-developer-survey-option" key={opt.id}>
                              <input
                                type="checkbox"
                                value={opt.id}
                                checked={checked}
                                onChange={(e) => {
                                  const current = Array.isArray(value) ? value : [];
                                  setAnswer(
                                    q.id,
                                    e.target.checked
                                      ? Array.from(new Set([...current, opt.id]))
                                      : current.filter((id) => id !== opt.id),
                                  );
                                }}
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                    {q.type === 'text' ? (
                      <input
                        className="p-developer-survey-text"
                        type="text"
                        maxLength={q.maxLength}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    ) : null}
                    {q.type === 'textarea' ? (
                      <textarea
                        className="p-developer-survey-textarea"
                        maxLength={q.maxLength}
                        rows={4}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    ) : null}
                    {q.type === 'text' || q.type === 'textarea' ? (
                      <p className="p-developer-survey-count">
                        {labels.characterCount(
                          typeof value === 'string' ? value.length : 0,
                          q.maxLength,
                        )}
                      </p>
                    ) : null}
                    {err ? <p className="p-developer-survey-error">{err}</p> : null}
                  </fieldset>
                );
              })}
            </div>
            {submitError ? <p className="p-developer-survey-error">{labels.submitError}</p> : null}
            <button
              type="button"
              className="p-developer-survey-submit"
              disabled={disabled}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {submitting ? labels.submitting : labels.submit}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
