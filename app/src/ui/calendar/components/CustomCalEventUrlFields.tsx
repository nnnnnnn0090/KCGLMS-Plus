import { useRef, useState } from 'react';
import {
  CUSTOM_CAL_EVENT_URLS_MAX,
  normalizeCustomCalEventUrl,
} from '../../../domain/custom-cal-events';
import { useI18n } from '../../../i18n';

interface UrlRow {
  key: number;
  value: string;
}

export interface CustomCalEventUrlsController {
  rows: UrlRow[];
  notice: string | null;
  add: () => void;
  remove: (key: number) => void;
  update: (key: number, value: string) => void;
  validate: (messages: { invalid: string; duplicate: string }) => string[] | null;
}

export function useCustomCalEventUrls(
  initialUrls: readonly string[] | undefined,
): CustomCalEventUrlsController {
  const nextKeyRef = useRef(0);
  const [rows, setRows] = useState<UrlRow[]>(() => {
    const values = initialUrls?.length ? initialUrls : [''];
    return values.map((value) => ({ key: ++nextKeyRef.current, value }));
  });
  const [notice, setNotice] = useState<string | null>(null);

  const update = (key: number, value: string) => {
    setNotice(null);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, value } : row)));
  };

  const remove = (key: number) => {
    setRows((current) => {
      if (current.length === 1) return [{ ...current[0], value: '' }];
      return current.filter((row) => row.key !== key);
    });
  };

  const add = () => {
    setRows((current) =>
      current.length >= CUSTOM_CAL_EVENT_URLS_MAX
        ? current
        : [...current, { key: ++nextKeyRef.current, value: '' }],
    );
  };

  const validate: CustomCalEventUrlsController['validate'] = (messages) => {
    const filled = rows.map((row) => row.value.trim()).filter(Boolean);
    const normalizedOrNull = filled.map(normalizeCustomCalEventUrl);
    if (normalizedOrNull.some((url) => url === null)) {
      setNotice(messages.invalid);
      return null;
    }
    const normalized = normalizedOrNull.filter((url): url is string => url !== null);
    const unique = [...new Set(normalized)];
    if (unique.length !== normalized.length) {
      setRows(
        (unique.length ? unique : ['']).map((value) => ({
          key: ++nextKeyRef.current,
          value,
        })),
      );
      setNotice(messages.duplicate);
      return null;
    }
    return unique;
  };

  return { rows, notice, add, remove, update, validate };
}

export function CustomCalEventUrlFields({
  controller,
}: {
  controller: CustomCalEventUrlsController;
}) {
  const { t } = useI18n();

  return (
    <div className="p-custom-cal-field">
      <span>{t.calendar.customEventUrls}</span>
      <div className="p-custom-cal-urls">
        {controller.rows.map((row, index) => (
          <div key={row.key} className="p-custom-cal-url-row">
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              value={row.value}
              maxLength={2048}
              placeholder={t.calendar.customEventUrlPlaceholder}
              aria-label={t.calendar.customEventUrlAria(index + 1)}
              onChange={(event) => controller.update(row.key, event.target.value)}
            />
            <button
              type="button"
              className="p-custom-cal-btn p-custom-cal-url-remove"
              aria-label={t.calendar.customEventUrlRemove}
              disabled={controller.rows.length === 1 && !row.value.trim()}
              onClick={() => controller.remove(row.key)}
            >
              ×
            </button>
          </div>
        ))}
        {controller.rows.length < CUSTOM_CAL_EVENT_URLS_MAX ? (
          <button
            type="button"
            className="p-custom-cal-btn p-custom-cal-url-add"
            onClick={controller.add}
          >
            {t.calendar.customEventUrlAdd}
            {` (${controller.rows.length}/${CUSTOM_CAL_EVENT_URLS_MAX})`}
          </button>
        ) : null}
      </div>
      <p className="p-custom-cal-hint">{t.calendar.customEventUrlHint}</p>
      {controller.notice ? (
        <p className="p-custom-cal-hint p-custom-cal-url-notice" role="status">
          {controller.notice}
        </p>
      ) : null}
    </div>
  );
}
