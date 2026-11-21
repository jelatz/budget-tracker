export function subscribeSyncLifecycle(onForeground: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleFocus = () => {
    onForeground();
  };

  const handleOnline = () => {
    onForeground();
  };

  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      onForeground();
    }
  };

  window.addEventListener('focus', handleFocus);
  window.addEventListener('online', handleOnline);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return () => {
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('online', handleOnline);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };
}
