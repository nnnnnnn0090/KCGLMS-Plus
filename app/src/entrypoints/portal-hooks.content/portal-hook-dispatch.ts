/**
 * フックで得た JSON を、定数 `MSG` の種別ごとにオーバーレイへ `postMessage` します。
 */

import { FETCH_HOOK, MSG } from '../../shared/constants';
import {
  isCampusCalendar,
  isDeliveredDetail,
  isDeliveredNendo,
  isHokoInfo,
  isHoshuCalendar,
  isKinoMessage,
  isKogiCalendar,
  isKogiNews,
  isKyoshitsuChange,
  isKyukoInfo,
  isNewTopics,
  isQuestionnaireInfo,
  isUserHtmlLink,
  isUserHtmlLinkMe,
  toAbs,
} from './portal-hook-paths';

/** 長時間タブ放置時のメモリ肥大を防ぐ（リプレイは直近のキャプチャで十分なケースが多い） */
const MAX_CAPTURED_MESSAGES = 400;

const sentMessages: object[] = [];

function rememberSent(msg: object): void {
  sentMessages.push(msg);
  const over = sentMessages.length - MAX_CAPTURED_MESSAGES;
  if (over > 0) sentMessages.splice(0, over);
}

function post(type: string, payload: object): void {
  const msg = { type, source: FETCH_HOOK.source, ...payload };
  rememberSent(msg);
  window.postMessage(msg, '*');
}

function postWithUrl(type: string, url: string, items: unknown[]): void {
  post(type, { items, requestUrl: toAbs(url) });
}

export function dispatch(url: string, json: unknown): void {
  if (isKinoMessage(url) && json && typeof json === 'object' && !Array.isArray(json)) {
    post(MSG.kinoMessage, { data: json });
    return;
  }
  if (
    isDeliveredDetail(url) &&
    json &&
    !Array.isArray(json) &&
    (json as Record<string, unknown>).id != null
  ) {
    const data = json as Record<string, unknown>;
    if (String(data.id).length > 0) {
      post(MSG.deliveredNewsDetail, { data, requestUrl: toAbs(url) });
      return;
    }
  }
  if (!Array.isArray(json)) return;
  if (isNewTopics(url)) post(MSG.newTopics, { items: json });
  if (isUserHtmlLinkMe(url)) post(MSG.userHtmlLinkMe, { items: json });
  else if (isUserHtmlLink(url)) post(MSG.userHtmlLink, { items: json });
  if (isKogiCalendar(url)) postWithUrl(MSG.kogiCalendar, url, json);
  if (isHoshuCalendar(url)) postWithUrl(MSG.hoshuCalendar, url, json);
  if (isCampusCalendar(url)) postWithUrl(MSG.campusCalendar, url, json);
  if (isKogiNews(url)) post(MSG.kogiNews, { items: json });
  if (isKyukoInfo(url)) postWithUrl(MSG.kyukoInfo, url, json);
  if (isHokoInfo(url)) postWithUrl(MSG.hokoInfo, url, json);
  if (isKyoshitsuChange(url)) postWithUrl(MSG.kyoshitsuChange, url, json);
  if (isDeliveredNendo(url)) postWithUrl(MSG.deliveredNews, url, json);
  if (isQuestionnaireInfo(url)) postWithUrl(MSG.questionnaireInfo, url, json);
}

export function replayAllSentMessages(): void {
  for (const msg of sentMessages) window.postMessage(msg, '*');
}
