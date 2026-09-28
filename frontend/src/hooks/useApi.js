/**
 * Custom React hook for API calls with loading, error, and data states.
 */

import { useState, useCallback } from 'react';

const API_BASE = '/api';

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Hook for GET requests that fetch data on demand.
 */
export function useApiGet() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (endpoint) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(endpoint);
      setData(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData };
}

/**
 * Hook for POST requests.
 */
export function useApiPost() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const postData = useCallback(async (endpoint, body) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setData(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, postData };
}

/**
 * Direct fetch helpers for simple one-off calls.
 */
export const api = {
  get: (endpoint) => apiFetch(endpoint),
  post: (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }),
};
