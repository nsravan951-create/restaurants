const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');

if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);

    try {
      const payload = Object.fromEntries(formData.entries());
      await apiRequest('/auth/register-owner', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage('authMessage', 'Owner account created. Please login.');
      registerForm.reset();
    } catch (error) {
      setMessage('authMessage', error.message, true);
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const payload = Object.fromEntries(formData.entries());
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setAuth(data);
      setMessage('authMessage', 'Login successful. Redirecting...');

      const role = data.user.role;
      if (role === 'owner') window.location.href = './owner.html';
      else if (role === 'super_admin') window.location.href = './admin.html';
      else if (role === 'kitchen') window.location.href = './kitchen.html';
      else if (role === 'staff') window.location.href = './staff.html';
      else window.location.href = '../index.html';
    } catch (error) {
      setMessage('authMessage', error.message, true);
    }
  });
}
