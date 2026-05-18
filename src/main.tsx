import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import axios from 'axios'

// ---------------------------------------------------------------------------
// Global axios request interceptor: auto-inject JWT on every request
// ---------------------------------------------------------------------------
// Reads the token from localStorage on every request. Avoids timing issues
// where axios.defaults wasn't set yet when a component fires its first call.
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token && config.headers && !(config.headers as any).Authorization) {
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Global fetch wrapper: auto-inject JWT on all /api/* requests
// ---------------------------------------------------------------------------
// Many components (NotificationContext, pages doing raw fetch to /api/bricks,
// /api/companies, etc.) don't manually attach the Authorization header. On
// servers where the JWT middleware protects all /api routes (e.g. CIV), those
// calls fail with "Unauthorized: missing token". This wrapper transparently
// reads the token from localStorage and adds it to every same-origin /api
// request, mirroring what axios.defaults already does for axios calls.
const _origFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  try {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    const isApiCall = url.includes('/api/');
    if (isApiCall) {
      const token = localStorage.getItem('authToken');
      if (token) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
          init = { ...init, headers };
        }
      }
    }
  } catch (_) {
    // Never break fetch on header injection error
  }
  return _origFetch(input as any, init);
};

createRoot(document.getElementById("root")!).render(<App />);
