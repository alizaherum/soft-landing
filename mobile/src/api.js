// The phone can't reach "localhost" of your dev machine — point this at your
// computer's LAN IP (e.g. http://192.168.1.42:3000) via EXPO_PUBLIC_API_BASE_URL
// in a .env file, or edit the fallback below directly.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed`);
  }
  return response.json();
}

export function createLinkToken() {
  return request('/api/create_link_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'mobile' }),
  }).then((data) => data.link_token);
}

export function exchangePublicToken(publicToken) {
  return request('/api/exchange_public_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  });
}

export function fetchBalance() {
  return request('/api/balance').then((data) => data.accounts);
}

export function fetchSpendingEstimate() {
  return request('/api/spending-estimate').catch(() => null);
}
