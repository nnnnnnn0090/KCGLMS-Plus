/**
 * Home2 Web メールの `mailhead.aspx` 受信一覧で、ページャー操作を `fetch` により同期します。
 */

const FORM_ID = 'ctl01';

export function getMailheadForm(): HTMLFormElement | null {
  const el = document.getElementById(FORM_ID);
  return el instanceof HTMLFormElement ? el : null;
}

export function serializeMailheadPost(
  form: HTMLFormElement,
  submitter: HTMLInputElement,
): URLSearchParams {
  const p = new URLSearchParams();
  for (const raw of form.elements) {
    if (!(raw instanceof HTMLElement)) continue;
    const name = (raw as HTMLInputElement).name;
    if (!name) continue;

    if (raw instanceof HTMLInputElement) {
      const { type } = raw;
      if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
        if (raw === submitter) p.append(name, raw.value);
        continue;
      }
      if (type === 'checkbox' || type === 'radio') {
        if (raw.checked) p.append(name, raw.value || 'on');
        continue;
      }
      if (type === 'file') continue;
      if (raw.disabled) continue;
      p.append(name, raw.value);
      continue;
    }
    if (raw instanceof HTMLSelectElement) {
      if (raw.disabled) continue;
      for (const opt of raw.selectedOptions) p.append(name, opt.value);
      continue;
    }
    if (raw instanceof HTMLTextAreaElement) {
      if (raw.disabled) continue;
      p.append(name, raw.value);
    }
  }
  return p;
}

function syncInputValueById(id: string, parsed: Document): void {
  const src = parsed.getElementById(id);
  const dst = document.getElementById(id);
  if (src instanceof HTMLInputElement && dst instanceof HTMLInputElement) dst.value = src.value;
}

/** 応答ドキュメントの内容を現在のページへ反映（一覧・ナビ・ViewState） */
export function applyMailheadDocumentToLive(parsed: Document): boolean {
  const tblNew = parsed.getElementById('MainContent_Table1');
  const tblLive = document.getElementById('MainContent_Table1');
  if (!(tblNew instanceof HTMLTableElement) || !(tblLive instanceof HTMLTableElement)) return false;

  tblLive.outerHTML = tblNew.outerHTML;

  const headNew = parsed.getElementById('MainContent_Table_HEAD');
  const headLive = document.getElementById('MainContent_Table_HEAD');
  if (headNew instanceof HTMLTableElement && headLive instanceof HTMLTableElement) {
    headLive.innerHTML = headNew.innerHTML;
  }

  const labNew = parsed.getElementById('MainContent_Label2');
  const labLive = document.getElementById('MainContent_Label2');
  if (labNew && labLive) labLive.textContent = labNew.textContent;

  for (const id of [
    '__VIEWSTATE',
    '__VIEWSTATEGENERATOR',
    '__EVENTVALIDATION',
    '__EVENTTARGET',
    '__EVENTARGUMENT',
  ]) {
    syncInputValueById(id, parsed);
  }

  const selNew = parsed.getElementById('MainContent_ddlst1');
  const selLive = document.getElementById('MainContent_ddlst1');
  if (selNew instanceof HTMLSelectElement && selLive instanceof HTMLSelectElement) {
    selLive.innerHTML = selNew.innerHTML;
    selLive.value = selNew.value;
  }

  return true;
}

export async function fetchMailheadPost(submitter: HTMLInputElement): Promise<Document> {
  const form = submitter.form ?? getMailheadForm();
  if (!form) throw new Error('mailhead form not found');

  const url = new URL(form.action || window.location.href, window.location.href).href;
  const body = serializeMailheadPost(form, submitter).toString();

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });

  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  if (!res.ok) throw new Error(`mailhead HTTP ${res.status}`);

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) throw new Error('mailhead response parse error');

  if (!doc.getElementById('MainContent_Table1')) {
    throw new Error('mailhead response missing list');
  }

  return doc;
}

export async function runMailheadPagerAsync(submitterId: string): Promise<void> {
  const el = document.getElementById(submitterId);
  if (!(el instanceof HTMLInputElement)) return;
  if (el.disabled) return;
  const doc = await fetchMailheadPost(el);
  if (!applyMailheadDocumentToLive(doc)) throw new Error('apply mailhead DOM failed');
}
