const registerForm = document.getElementById('registerForm');
const ownerLoginForm = document.getElementById('ownerLoginForm');
const teamLoginForm = document.getElementById('teamLoginForm');
const legacyLoginForm = document.getElementById('loginForm');

const PLATFORM_TEAM_ROLES = new Set([
  'finance_manager', 'payment_manager', 'settlement_manager', 'subscription_manager',
  'restaurant_manager', 'registration_manager', 'operations_manager', 'features_manager',
  'ads_manager', 'promotions_manager', 'analytics_manager', 'user_enquiry_manager',
  'support_manager', 'database_manager', 'backend_manager',
]);

function isPlatformTeamUser(user) {
  if (!user?.role) return false;
  if (user.role === 'super_admin' || user.role === 'owner') return false;
  if (user.isPlatformTeam) return true;
  if (PLATFORM_TEAM_ROLES.has(user.role)) return true;
  return String(user.role).endsWith('_manager');
}

function redirectAfterLogin(user) {
  const role = user.role;
  if (role === 'owner') return './owner.html';
  if (role === 'super_admin') return './admin.html';
  if (isPlatformTeamUser(user)) return './team.html';
  if (role === 'kitchen') return './kitchen.html';
  if (role === 'staff') return './staff.html';
  return '../index.html';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.authTab === tab);
  });
  document.getElementById('authPanelOwner')?.classList.toggle('hidden', tab !== 'owner');
  document.getElementById('authPanelTeam')?.classList.toggle('hidden', tab !== 'team');
  document.getElementById('authPanelRegister')?.classList.toggle('hidden', tab !== 'register');
}

document.querySelectorAll('[data-auth-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab));
});

try {
  const authMessage = sessionStorage.getItem('owner_auth_message');
  if (authMessage) {
    setMessage('authMessage', authMessage, true);
    sessionStorage.removeItem('owner_auth_message');
  }
  if (sessionStorage.getItem('prefer_team_tab')) {
    switchAuthTab('team');
    sessionStorage.removeItem('prefer_team_tab');
  }
} catch (_) {}

async function performLogin(formData) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: formData.get('email'),
      password: formData.get('password'),
    }),
  });
}

async function handleOwnerLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    const data = await performLogin(formData);
    const role = data.user.role;

    if (isPlatformTeamUser(data.user) && role !== 'super_admin') {
      setMessage('authMessage', 'This is a team staff account. Use the Team Staff tab to sign in.', true);
      return;
    }
    if (role !== 'owner' && role !== 'super_admin') {
      setMessage('authMessage', 'This account cannot use owner login. Try Team Staff or contact support.', true);
      return;
    }

    setMessage('authMessage', role === 'super_admin'
      ? 'Welcome back. Opening Admin Control Center...'
      : 'Login successful. Opening owner dashboard...');
    setAuth(data);
    await goToPage(redirectAfterLogin(data.user), { statusText: 'Loading...' });
  } catch (error) {
    setMessage('authMessage', error.message, true);
  }
}

async function handleTeamLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    const data = await performLogin(formData);
    const role = data.user.role;

    if (role === 'owner') {
      setMessage('authMessage', 'This is a restaurant owner account. Use the Restaurant Owner tab.', true);
      return;
    }
    if (role === 'super_admin') {
      setMessage('authMessage', 'Super Admin detected. Opening Admin Control Center...');
      setAuth(data);
      await goToPage('./admin.html', { statusText: 'Loading...' });
      return;
    }
    if (!isPlatformTeamUser(data.user)) {
      setMessage('authMessage', 'This account is not a platform team member. Ask your admin to create one in Admin → Team.', true);
      return;
    }

    const roleLabel = role.replace(/_/g, ' ');
    setMessage('authMessage', `Welcome! Opening your ${roleLabel} workspace...`);
    setAuth(data);
    await goToPage('./team.html', { statusText: 'Loading...' });
  } catch (error) {
    setMessage('authMessage', error.message, true);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    const data = await performLogin(formData);
    setMessage('authMessage', 'Login successful. Redirecting...');
    setAuth(data);
    await goToPage(redirectAfterLogin(data.user), { statusText: 'Loading...' });
  } catch (error) {
    setMessage('authMessage', error.message, true);
  }
}

if (ownerLoginForm) {
  ownerLoginForm.addEventListener('submit', handleOwnerLogin);
}
if (teamLoginForm) {
  teamLoginForm.addEventListener('submit', handleTeamLogin);
}
if (legacyLoginForm) {
  legacyLoginForm.addEventListener('submit', handleLogin);
}

if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const payload = Object.fromEntries(formData.entries());

    fetch(`${window.API_URL}/api/auth/register-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
        return data;
      })
      .then(() => {
        setMessage('authMessage', 'Restaurant account created. Please login as owner.');
        registerForm.reset();
        switchAuthTab('owner');
      })
      .catch((err) => setMessage('authMessage', err.message, true));
  });
}
