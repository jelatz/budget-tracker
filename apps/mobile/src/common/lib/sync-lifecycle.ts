import { AppState } from 'react-native';

export function subscribeSyncLifecycle(onForeground: () => void): () => void {
  const subscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      onForeground();
    }
  });

  return () => {
    subscription.remove();
  };
}
