/**
 * トースト通知コンポーネント。
 */

import { useToast, copyToClipboard, type ToastState } from '../../../services/toast';

export { useToast, copyToClipboard, type ToastState };

interface ToastProps {
  toast: ToastState;
  onAnimationEnd: (e: React.AnimationEvent<HTMLDivElement>) => void;
}

export function Toast({ toast, onAnimationEnd }: ToastProps) {
  if (!toast.visible) return null;
  const cls = [
    'p-toast',
    toast.placement === 'top' ? 'p-toast--top' : '',
    toast.closing ? 'p-toast--closing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id="p-toast"
      className={cls}
      role="status"
      aria-live="polite"
      onAnimationEnd={onAnimationEnd}
    >
      {toast.message}
    </div>
  );
}
