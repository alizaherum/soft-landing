const linkButton = document.getElementById('link-button');
const statusEl = document.getElementById('status');
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

linkButton.addEventListener('click', async () => {
  linkButton.disabled = true;
  statusEl.textContent = 'Connecting…';

  try {
    const linkToken = await createLinkToken();

    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken) => {
        try {
          statusEl.textContent = 'Fetching your balance…';
          await exchangePublicToken(publicToken);
          const accounts = await fetchBalance();
          renderBalances(accounts);
          statusEl.textContent = 'Connected';
        } catch (err) {
          console.error(err);
          statusEl.textContent = 'Something went wrong while fetching your balance.';
        } finally {
          linkButton.disabled = false;
        }
      },
      onExit: (err) => {
        linkButton.disabled = false;
        if (err) {
          console.error(err);
          statusEl.textContent = 'Connection was not completed.';
        } else {
          statusEl.textContent = '';
        }
      },
    });

    handler.open();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not start the connection. Please try again.';
    linkButton.disabled = false;
  }
});
