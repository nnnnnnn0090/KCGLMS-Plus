import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  important: '#portal-overlay',
  prefix: 'tw-',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        portal: {
          bg: 'var(--p-bg)',
          bg2: 'var(--p-bg2)',
          bg3: 'var(--p-bg3)',
          hover: 'var(--p-bg-hover)',
          border: 'var(--p-border)',
          'border-light': 'var(--p-border-light)',
          'border-hover': 'var(--p-border-hover)',
          text: 'var(--p-text)',
          muted: 'var(--p-text-muted)',
          dim: 'var(--p-text-dim)',
          dimmer: 'var(--p-text-dimmer)',
          bright: 'var(--p-text-bright)',
          accent: 'var(--p-accent)',
          'on-accent': 'var(--p-on-accent)',
          'accent-light': 'var(--p-accent-light)',
          'accent-bg': 'var(--p-accent-bg)',
          'accent-border': 'var(--p-accent-border)',
          danger: 'var(--p-danger)',
          'danger-hover': 'var(--p-danger-hover)',
        },
        community: {
          bg: 'var(--p-bg)',
          bg2: 'var(--p-bg2)',
          bg3: 'var(--p-bg3)',
          border: 'var(--p-border)',
          'border-light': 'var(--p-border-light)',
          text: 'var(--p-text)',
          bright: 'var(--p-text-bright)',
          muted: 'var(--p-text-muted)',
          accent: 'var(--p-accent)',
          'on-accent': 'var(--p-on-accent)',
          'accent-light': 'var(--p-accent-light)',
          'accent-bg': 'var(--p-accent-bg)',
          danger: 'var(--p-danger, #e54867)',
        },
      },
      fontFamily: {
        portal: [
          'var(--p-font)',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
      maxWidth: {
        portal: '1100px',
      },
      width: {
        'tour-progress-1-6': '16.666667%',
        'tour-progress-2-6': '33.333333%',
        'tour-progress-3-6': '50%',
        'tour-progress-4-6': '66.666667%',
        'tour-progress-5-6': '83.333333%',
      },
      zIndex: {
        overlay: '2147483647',
        'boot-cover': '2147483646',
      },
      borderRadius: {
        portal: '12px',
        panel: '16px',
        modal: '18px',
      },
      boxShadow: {
        portal: '0 8px 32px var(--p-shadow)',
        'portal-strong': '0 24px 80px var(--p-shadow-strong)',
        'community-modal': '0 24px 80px color-mix(in srgb, #000 34%, transparent)',
      },
      keyframes: {
        'portal-fade-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'portal-scale-in': {
          from: { opacity: '0', transform: 'scale(.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'portal-scale-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(.96)' },
        },
        'portal-toast-from-top': {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'portal-toast-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(.96)' },
        },
        'portal-toast-out-top': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(-10px)' },
        },
        'community-fade-in': { from: { opacity: '0' } },
        'community-dialog-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(.985)' },
        },
      },
      animation: {
        'portal-fade-in': 'portal-fade-in var(--p-enter-dur) var(--p-enter-ease) both',
        'portal-scale-in': 'portal-scale-in var(--p-pop-dur) var(--p-enter-ease) both',
        'portal-scale-out': 'portal-scale-out var(--p-pop-dur) var(--p-enter-ease) both',
        'portal-toast-from-top': 'portal-toast-from-top 180ms ease both',
        'portal-toast-out': 'portal-toast-out 180ms ease both',
        'portal-toast-out-top': 'portal-toast-out-top 180ms ease both',
        'community-fade-in': 'community-fade-in 180ms ease both',
        'community-dialog-in': 'community-dialog-in 180ms ease both',
      },
    },
  },
  plugins: [],
} satisfies Config;
