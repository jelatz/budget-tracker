import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const rnColorScheme = useRNColorScheme();
  const [webScheme, setWebScheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    setHasHydrated(true);

    if (typeof document === 'undefined') return;

    const updateScheme = () => {
      setWebScheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    };

    updateScheme();

    const observer = new MutationObserver(() => {
      updateScheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!hasHydrated) {
    return 'light';
  }

  if (typeof document !== 'undefined') {
    return webScheme;
  }

  return rnColorScheme;
}
