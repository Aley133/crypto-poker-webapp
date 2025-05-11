// js/api.js
export const api = async (path, params = {}) => {
  const q = new URLSearchParams(params);
  const res = await fetch(`${path}?${q}`, { credentials: 'same-origin' });
  if (!res.ok) throw await res.json();
  return res.json();
};
