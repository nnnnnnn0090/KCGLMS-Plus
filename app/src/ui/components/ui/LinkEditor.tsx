/**
 * ホームページのショートカットリンクの表示・編集コンポーネント。
 * リンク本体はポータル API。並び順・非表示は storage 経由でポータル同期。
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { HOME2_MAIL_DIRECTORY_URL } from '../../../shared/constants';
import { useI18n } from '../../../i18n';
import type { PortalUserLink } from '../../../services/user-html-link';
import { addPortalUserLink, deletePortalUserLink } from '../../../services/user-html-link';
import { readShortcutLayout, saveShortcutLayout } from '../../../services/shortcut-layout';
import {
  buildLinkEditorRows,
  linkKey,
  LINK_EDITOR_EXTRAS,
  orderLinkEditorRows,
  type ApiLink,
  type LinkEditorRow,
} from './link-editor-rows';

interface LinkEditorProps {
  items: ApiLink[];
  userLinks: PortalUserLink[];
  editing: boolean;
}

export function LinkEditor({ items, userLinks, editing }: LinkEditorProps) {
  const { t } = useI18n();
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [rows, setRows] = useState<LinkEditorRow[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [dragUi, setDragUi] = useState<{ from: number; over: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  /** 保存に失敗したときの理由（null なら表示しない） */
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 削除に成功したリンク。ポータルから一覧を取り直す前でも、すぐ画面から消す。 */
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  const dragSrcIdx = useRef(-1);
  const layoutRef = useRef({ order: [] as string[], hidden: [] as string[] });

  const rebuildRows = useCallback(
    (order: string[]) => {
      const built = buildLinkEditorRows(items, LINK_EDITOR_EXTRAS, userLinks).filter(
        (row) => !(row.portalId && removedIds.has(row.portalId)),
      );
      setRows(orderLinkEditorRows(built, order));
    },
    [items, userLinks, removedIds],
  );

  useEffect(() => {
    let cancelled = false;
    void readShortcutLayout().then((layout) => {
      if (cancelled) return;
      layoutRef.current = layout;
      setHiddenKeys(layout.hidden);
      rebuildRows(layout.order);
      setLayoutReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [rebuildRows]);

  useEffect(() => {
    if (!layoutReady) return;
    rebuildRows(layoutRef.current.order);
  }, [items, userLinks, layoutReady, rebuildRows]);

  const persistLayout = useCallback(async (nextRows: LinkEditorRow[], hidden: string[]) => {
    const order = nextRows.map((row) => row.key);
    layoutRef.current = { order, hidden };
    await saveShortcutLayout({ order, hidden });
  }, []);

  function toggleHidden(key: string): void {
    setHiddenKeys((prev) => {
      const hidden = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      void persistLayout(rows, hidden);
      return hidden;
    });
  }

  async function deleteCustom(portalId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      await deletePortalUserLink(portalId);
      setRemovedIds((prev) => new Set(prev).add(portalId));
      setRows((prev) => prev.filter((row) => row.portalId !== portalId));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function addCustomLink(): Promise<void> {
    const name = addName.trim();
    const url = addUrl.trim();
    if (!name || !url || busy) return;
    try {
      new URL(url);
    } catch {
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      await addPortalUserLink(name, url);
      setAddName('');
      setAddUrl('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function onDragStart(e: React.DragEvent, idx: number): void {
    dragSrcIdx.current = idx;
    setDragUi({ from: idx, over: null });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }

  function onDragOver(e: React.DragEvent, idx: number): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const src = dragSrcIdx.current;
    if (src < 0) return;
    setDragUi((d) => {
      if (!d) return { from: src, over: idx === src ? null : idx };
      return { ...d, over: idx === src ? null : idx };
    });
  }

  function onDragEnd(): void {
    dragSrcIdx.current = -1;
    setDragUi(null);
  }

  function onDrop(e: React.DragEvent, toIdx: number): void {
    e.preventDefault();
    const srcIdx = dragSrcIdx.current;
    if (srcIdx < 0 || srcIdx === toIdx) return;
    const newRows = [...rows];
    const [moved] = newRows.splice(srcIdx, 1);
    newRows.splice(toIdx, 0, moved);
    dragSrcIdx.current = -1;
    setDragUi(null);
    setRows(newRows);
    void persistLayout(newRows, hiddenKeys);
  }

  if (!layoutReady) {
    return <p className="p-empty">{t.linkEditor.empty}</p>;
  }

  const hidden = new Set(hiddenKeys);
  const visible = rows.filter((r) => !hidden.has(r.key));

  if (!editing) {
    return visible.length === 0 ? (
      <p className="p-empty">{t.linkEditor.empty}</p>
    ) : (
      <div className="p-link-list">
        {visible.map((r) => (
          <article key={r.portalId ?? r.key} className="p-shortcut">
            <a
              className="p-shortcut-link"
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              id={
                r.midashi === '学生出欠登録'
                  ? 'p-shortcut-attendance'
                  : linkKey(r.url) === linkKey(HOME2_MAIL_DIRECTORY_URL)
                    ? 'p-shortcut-webmail'
                    : undefined
              }
            >
              <span className="p-shortcut-title">{r.midashi}</span>
              {r.biko ? <span className="p-shortcut-meta">{r.biko}</span> : null}
            </a>
          </article>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="p-link-edit-list">
        {rows.map((r, i) => (
          <div
            key={r.portalId ?? r.key}
            className={`p-link-edit-item${hidden.has(r.key) ? ' is-hidden' : ''}${
              dragUi?.from === i ? ' is-dragging' : ''
            }${dragUi?.over === i ? ' is-drag-over' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, i)}
            onDragOver={(e) => onDragOver(e, i)}
            onDragEnd={onDragEnd}
            onDrop={(e) => onDrop(e, i)}
          >
            <span
              className="p-link-edit-grip"
              aria-hidden="true"
              title={t.linkEditor.dragToReorder}
            >
              ⋮⋮
            </span>
            <span className="p-link-edit-name">{r.midashi}</span>
            <button
              type="button"
              className="p-link-edit-vis"
              title={hidden.has(r.key) ? t.linkEditor.showOnHome : t.linkEditor.hideOnHome}
              onClick={() => toggleHidden(r.key)}
            >
              {hidden.has(r.key) ? t.common.show : t.common.hide}
            </button>
            {r.isCustom && r.portalId ? (
              <button
                type="button"
                className="p-link-edit-del"
                title={t.common.delete}
                disabled={busy}
                onClick={() => void deleteCustom(r.portalId!)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {saveError !== null ? (
        <p className="p-link-edit-error" role="alert">
          {t.linkEditor.saveFailed}
          {saveError ? <span className="p-link-edit-error-detail"> ({saveError})</span> : null}
        </p>
      ) : null}
      <div className="p-link-add-form">
        <input
          type="text"
          className="p-link-add-input"
          placeholder={t.linkEditor.linkNamePlaceholder}
          autoComplete="off"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          disabled={busy}
        />
        <input
          type="url"
          className="p-link-add-input"
          placeholder={t.linkEditor.urlPlaceholder}
          autoComplete="off"
          value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="p-link-add-btn"
          onClick={() => void addCustomLink()}
          disabled={busy}
        >
          {t.common.add}
        </button>
      </div>
    </>
  );
}
