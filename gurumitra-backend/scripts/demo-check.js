/**
 * Quick demo check: health + login for teacher, management, admin.
 * Run: node scripts/demo-check.js
 */
const BASE = 'http://localhost:3001';

async function check() {
  console.log('=== GuruMitra Demo Check ===\n');

  try {
    const healthRes = await fetch(BASE + '/health');
    const health = await healthRes.json();
    console.log('1. Backend health:', healthRes.status === 200 ? 'OK' : 'FAIL', health);
    if (healthRes.status !== 200) {
      console.log('   Backend may be down or DB disconnected.');
      return;
    }
  } catch (e) {
    console.log('1. Backend health: FAIL -', e.message);
    console.log('   Fix: In a separate terminal, start the backend first:');
    console.log('        cd gurumitra-backend');
    console.log('        npm start');
    console.log('   Then run this script again.');
    return;
  }

  const logins = [
    { email: 'teacher@gurumitra.demo', password: 'demo123', role: 'Teacher' },
    { email: 'management@gurumitra.demo', password: 'demo123', role: 'Management' },
    { email: 'admin@gurumitra.demo', password: 'demo123', role: 'Admin' },
  ];

  for (const u of logins) {
    try {
      const res = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, password: u.password }),
      });
      const data = await res.json();
      if (res.ok && data.token && data.user?.role === u.role.toLowerCase()) {
        console.log('2. Login', u.role + ':', 'OK (token received)');
      } else {
        console.log('2. Login', u.role + ':', 'FAIL', data.error || data);
      }
    } catch (e) {
      console.log('2. Login', u.role + ':', 'FAIL -', e.message);
    }
  }

  console.log('\n=== Frontend ===');
  console.log('Open http://localhost:5173 and sign in with any demo account.');
  console.log('If frontend is not running: cd gurumitra-frontend && npm run dev');
}

check();
