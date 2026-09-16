const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');

try {
  const authMessage = sessionStorage.getItem('owner_auth_message');
  if (authMessage) {
    setMessage('authMessage', authMessage, true);
    sessionStorage.removeItem('owner_auth_message');
  }
} catch (_) {}

if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const payload = Object.fromEntries(formData.entries());

    fetch(`${window.API_URL}/api/auth/register-owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 409) {
            throw new Error('User already exists');
          }
          throw new Error(data.error || data.message || 'Request failed');
        }

        return data;
      })
      .then(() => {
        console.log('Success: registered owner');
        setMessage('authMessage', 'Owner account created. Please login.');
        registerForm.reset();
      })
      .catch((err) => {
        console.error('Error:', err.message);
        setMessage('authMessage', err.message, true);
      });
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const payload = Object.fromEntries(formData.entries());
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setAuth(data);
      setMessage('authMessage', 'Login successful. Redirecting...');

      const role = data.user.role;
      if (role === 'owner') window.location.href = './owner.html';
      else if (role === 'super_admin') window.location.href = './admin.html';
      else if (data.user.isPlatformTeam || String(role).endsWith('_manager')) window.location.href = './team.html';
      else if (role === 'kitchen') window.location.href = './kitchen.html';
      else if (role === 'staff') window.location.href = './staff.html';
      else window.location.href = '../index.html';
    } catch (error) {
      setMessage('authMessage', error.message, true);
    }
  });
}
