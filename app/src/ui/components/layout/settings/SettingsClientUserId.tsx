import { useEffect, useState } from 'react';
import { useI18n } from '../../../../i18n';
import { getOrCreateClientUserId } from '../../../../services/client-identity';
import { copyToClipboard } from '../../../../services/toast';

/** サポート連絡用の匿名ユーザー ID（フィードバックセクション内に埋め込む） */
export function SettingsClientUserIdBlock() {
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void getOrCreateClientUserId().then(setUserId);
  }, []);

  if (!userId) return null;

  async function onCopy(): Promise<void> {
    if (!(await copyToClipboard(userId!))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-settings-client-user-id-block">
      <p className="p-settings-row-label p-settings-client-user-id-label">
        {t.settings.clientUserIdLabel}
      </p>
      <p className="p-settings-hint p-settings-hint--tight">{t.settings.clientUserIdHint}</p>
      <div className="p-settings-row p-settings-row-actions p-settings-client-user-id-row">
        <output className="p-settings-client-user-id-code" aria-live="off">
          {userId}
        </output>
        <button
          type="button"
          className="p-settings-client-user-id-copy"
          onClick={() => void onCopy()}
          aria-label={`${t.settings.clientUserIdCopy}. ${userId}`}
        >
          {copied ? t.settings.clientUserIdCopied : t.settings.clientUserIdCopy}
        </button>
      </div>
    </div>
  );
}
