const registerForm = document.getElementById('registerForm');
const ownerLoginForm = document.getElementById('ownerLoginForm');
const teamLoginForm = document.getElementById('teamLoginForm');
const legacyLoginForm = document.getElementById('loginForm');

try {
  const authMessage = sessionStorage.getItem('owner_auth_message');
  if (authMessage) {
    setMessage('authMessage', authMessage, true);
    sessionStorage.removeItem('owner_auth_message');
  }
} catch (_) {}

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

async function handleLogin(event, expectedRoles = null) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const roleHint = formData.get('roleHint');

  try {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    });

    const role = data.user.role;

    if (roleHint && role !== roleHint && role !== 'super_admin') {
      setMessage('authMessage', `This account is "${role.replace(/_/g, ' ')}", not "${String(roleHint).replace(/_/g, ' ')}". Login succeeded — redirecting to your workspace.`, true);
    } else {
      setMessage('authMessage', 'Login successful. Redirecting...');
    }

    setAuth(data);

    setTimeout(() => {
      if (role === 'owner') window.location.href = './owner.html';
      else if (role === 'super_admin') window.location.href = './admin.html';
      else if (data.user.isPlatformTeam || String(role).endsWith('_manager')) window.location.href = './team.html';
      else if (role === 'kitchen') window.location.href = './kitchen.html';
      else if (role === 'staff') window.location.href = './staff.html';
      else window.location.href = '../index.html';
    }, 400);
  } catch (error) {
    setMessage('authMessage', error.message, true);
  }
}

if (ownerLoginForm) {
  ownerLoginForm.addEventListener('submit', (e) => handleLogin(e, ['owner', 'super_admin']));
}
if (teamLoginForm) {
  teamLoginForm.addEventListener('submit', (e) => handleLogin(e));
}
if (legacyLoginForm) {
  legacyLoginForm.addEventListener('submit', (e) => handleLogin(e));
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
