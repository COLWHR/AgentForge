const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = async (path: string, options: RequestInit = {}) => {
  // B2: Read token from dev-injected environment variable.
  // This is injected by frontend/scripts/dev-with-token.mjs via VITE_DEV_JWT_TOKEN.
  const token = import.meta.env.VITE_DEV_JWT_TOKEN || import.meta.env.VITE_VALID_JWT_TOKEN;

  if (!token) {
    console.error('DEVELOPMENT ERROR: Authorization token is missing.');
    console.error('Ensure you are starting the frontend with "npm run dev" to auto-inject the dev token.');
    throw new Error('Authorization token is missing. Please restart the dev server.');
  }

  const url = `${API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API Error: ${response.status}`);
  }

  return response.json();
};
