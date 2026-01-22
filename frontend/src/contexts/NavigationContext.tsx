/**
 * Navigation Context
 *
 * Simple context for navigating between app pages/modes.
 */

import { createContext, useContext } from 'react';

export type AppPage = 'design' | 'execution' | 'mcp';

interface NavigationContextValue {
  currentPage: AppPage;
  navigateTo: (page: AppPage) => void;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
