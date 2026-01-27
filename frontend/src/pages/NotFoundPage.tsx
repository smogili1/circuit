import { useNavigate } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="text-center">
        <AlertCircle size={64} className="mx-auto mb-4 text-gray-400" />
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          404
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Page not found
        </p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Home size={18} />
          Go to Home
        </button>
      </div>
    </div>
  );
}
