import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppLanguage } from '../i18n/messages';
import storage from '../lib/storage';
import { SK } from '../shared/constants';
import {
  developerSurveyKey,
  fetchDeveloperSurveyJson,
  normalizeDeveloperSurvey,
  submitDeveloperSurveyResponse,
  type DeveloperSurvey,
  type DeveloperSurveyAnswers,
  type DeveloperSurveyOption,
  type DeveloperSurveyQuestion,
  type DeveloperSurveyQuestionType,
} from '../services/developer-content';

export type {
  DeveloperSurveyQuestionType,
  DeveloperSurveyOption,
  DeveloperSurveyQuestion,
  DeveloperSurvey,
  DeveloperSurveyAnswers,
};

export interface UseDeveloperSurveyResult {
  survey: DeveloperSurvey | null;
  answered: boolean;
  ready: boolean;
  submitting: boolean;
  submitted: boolean;
  error: string;
  submit: (answers: DeveloperSurveyAnswers) => Promise<boolean>;
}

function answeredList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function useDeveloperSurvey(language: AppLanguage): UseDeveloperSurveyResult {
  const [rawSurvey, setRawSurvey] = useState<unknown>(null);
  const [answeredKeys, setAnsweredKeys] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');

    void Promise.all([storage.get(SK.developerSurveyAnswered), fetchDeveloperSurveyJson()])
      .then(async ([stored, response]) => {
        if (!response.ok) throw new Error(String(response.status));
        const json = await response.json();
        if (cancelled) return;
        setAnsweredKeys(answeredList(stored[SK.developerSurveyAnswered]));
        setRawSurvey(json);
      })
      .catch(() => {
        if (!cancelled) {
          setRawSurvey(null);
          setError('');
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const survey = useMemo(
    () => normalizeDeveloperSurvey(rawSurvey, language),
    [rawSurvey, language],
  );

  const answered = useMemo(
    () => Boolean(survey && answeredKeys.includes(developerSurveyKey(survey))),
    [answeredKeys, survey],
  );

  const submit = useCallback(
    async (answers: DeveloperSurveyAnswers): Promise<boolean> => {
      if (!survey || submitting || answered) return false;
      setSubmitting(true);
      setError('');
      try {
        const response = await submitDeveloperSurveyResponse(survey.id, survey.revision, answers);
        if (!response.ok) throw new Error(String(response.status));
        const key = developerSurveyKey(survey);
        const next = Array.from(new Set([...answeredKeys, key]));
        await storage.set({ [SK.developerSurveyAnswered]: next });
        setAnsweredKeys(next);
        setSubmitted(true);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [answered, answeredKeys, submitting, survey],
  );

  return { survey, answered, ready, submitting, submitted, error, submit };
}
