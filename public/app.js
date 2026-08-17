const linkButton = document.getElementById('link-button');
const statusEl = document.getElementById('status');
const statusCard = document.getElementById('status-card');
const balanceContainer = document.getElementById('balance-container');
const balanceList = document.getElementById('balance-list');

async function createLinkToken() {
  const response = await fetch('/api/create_link_token', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to create link token');
  const data = await response.json();
  return data.link_token;
}

async function exchangePublicToken(publicToken) {
  const response = await fetch('/api/exchange_public_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  });
  if (!response.ok) throw new Error('Failed to exchange public token');
}

async function fetchBalance() {
  const response = await fetch('/api/balance');
  if (!response.ok) throw new Error('Failed to fetch balance');
  const data = await response.json();
  return data.accounts;
}

function formatCurrency(amount, isoCurrencyCode) {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: isoCurrencyCode || 'USD',
  }).format(amount);
}

function renderBalances(accounts) {
  balanceList.innerHTML = '';
  accounts.forEach((account) => {
    const li = document.createElement('li');
    const amount = account.balances.available ?? account.balances.current;
    li.textContent = `${account.name} (••${account.mask}): ${formatCurrency(
      amount,
      account.balances.iso_currency_code
    )}`;
    balanceList.appendChild(li);
  });
  balanceContainer.classList.remove('hidden');
}

async function revealBalance() {
  statusCard.disabled = true;
  try {
    const accounts = await fetchBalance();
    renderBalances(accounts);
    statusCard.classList.add('hidden');
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not load your balance. Tap the status again to retry.';
    statusCard.disabled = false;
  }
}

statusCard.addEventListener('click', revealBalance);

function buildHandler(linkToken, receivedRedirectUri) {
  return Plaid.create({
    token: linkToken,
    receivedRedirectUri,
    onSuccess: async (publicToken) => {
      try {
        statusEl.textContent = '';
        await exchangePublicToken(publicToken);
        statusCard.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        statusEl.textContent = 'Something went wrong while connecting your bank.';
      } finally {
        linkButton.disabled = false;
        sessionStorage.removeItem('plaid_link_token');
      }
    },
    onExit: (err) => {
      linkButton.disabled = false;
      sessionStorage.removeItem('plaid_link_token');
      if (err) {
        console.error(err);
        statusEl.textContent = 'Connection was not completed.';
      } else {
        statusEl.textContent = '';
      }
    },
  });
}

linkButton.addEventListener('click', async () => {
  linkButton.disabled = true;
  statusEl.textContent = 'Connecting…';
  statusCard.classList.add('hidden');
  balanceContainer.classList.add('hidden');

  try {
    const linkToken = await createLinkToken();
    sessionStorage.setItem('plaid_link_token', linkToken);
    buildHandler(linkToken).open();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not start the connection. Please try again.';
    linkButton.disabled = false;
  }
});

// If Plaid redirected back here after an OAuth bank hand-off (UK/Open Banking
// institutions always redirect, even in sandbox), resume the same Link session
// using the token we stashed before the redirect.
if (window.location.search.includes('oauth_state_id=')) {
  const linkToken = sessionStorage.getItem('plaid_link_token');
  if (linkToken) {
    statusEl.textContent = 'Finishing connection…';
    linkButton.disabled = true;
    buildHandler(linkToken, window.location.href).open();
  }
}
