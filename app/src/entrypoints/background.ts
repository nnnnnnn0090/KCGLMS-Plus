import { registerInstallOpenHandlers } from '../services/install-open';
import { registerToolbarBadge } from '../services/toolbar-badge';

/** 初回インストール時だけ、オンボーディングを開始する学生ポータルを開く。オフ中はアイコンに印を付ける。 */
export default defineBackground(() => {
  registerInstallOpenHandlers();
  registerToolbarBadge();
});
