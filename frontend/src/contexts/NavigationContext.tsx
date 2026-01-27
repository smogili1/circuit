/**
 * Navigation Context
 *
 * Context for navigating between app pages/modes using React Router.
 */

import { createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export type AppPage = 'design' | 'execution' | 'mcp';

interface NavigationContextValue {
  currentPage: AppPage;
  navigateTo: (page: AppPage, workflowId?: string) => void;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

/**
 * Hook to create navigation context value using React Router
 */
export function useNavigationValue(workflowId: string | null): NavigationContextValue {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current page from URL
  const currentPage: AppPage = location.pathname.startsWith('/mcp')
    ? 'mcp'
    : location.pathname.includes('/executions')
    ? 'execution'
    : 'design';

  const navigateTo = (page: AppPage, targetWorkflowId?: string) => {
    const id = targetWorkflowId || workflowId;

    switch (page) {
      case 'design':
        if (id) {
          navigate(`/workflows/${id}`);
        } else {
          navigate('/workflows');
        }
        break;
      case 'execution':
        if (id) {
          navigate(`/workflows/${id}/executions`);
        } else {
          navigate('/workflows');
        }
        break;
      case 'mcp':
        navigate('/mcp');
        break;
    }
  };

  return { currentPage, navigateTo };
}
