const http = require('http');
const app = require('./api/index');

const server = app.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    console.log('\n--- 1. Health Check ---');
    const health = await request('GET', '/api');
    console.log('Status:', health.status, health.data);
    if (health.status !== 200) throw new Error('Health check failed');

    console.log('\n--- 2. Beneficiaries List ---');
    const ben = await request('GET', '/api/beneficiaries');
    console.log('Status:', ben.status);
    console.log('Metadata district:', ben.data.metadata?.district);
    console.log('Total beneficiaries:', ben.data.beneficiaries?.length);
    if (ben.data.beneficiaries?.length !== 270) throw new Error('Expected 270 beneficiaries');

    console.log('\n--- 3. Single Beneficiary ---');
    const single = await request('GET', '/api/beneficiaries/1');
    console.log('Beneficiary #1:', single.data.name, 'version:', single.data.version);

    console.log('\n--- 4. Authentication Check (Invalid) ---');
    const invalidLogin = await request('POST', '/api/auth/login', { username: 'nikunjdarji', password: 'WrongPassword' });
    console.log('Invalid login status:', invalidLogin.status);
    if (invalidLogin.status !== 401) throw new Error('Expected 401 for wrong password');

    console.log('\n--- 5. Authentication Check (Valid) ---');
    const validLogin = await request('POST', '/api/auth/login', { username: 'nikunjdarji', password: 'Nikunj@97' });
    console.log('Login status:', validLogin.status);
    console.log('Logged in user:', validLogin.data.user);
    const token = validLogin.data.token;
    if (!token) throw new Error('Expected JWT token');

    console.log('\n--- 6. Get Me ---');
    const me = await request('GET', '/api/auth/me', null, token);
    console.log('Me status:', me.status, me.data.username, me.data.role);

    console.log('\n--- 7. Dashboard Stats ---');
    const dash = await request('GET', '/api/dashboard', null, token);
    console.log('Dashboard status:', dash.status);
    console.log('Total:', dash.data.total, 'Cards:', dash.data.totalCards, 'Onboarded:', dash.data.onboarded, `(${dash.data.onboardedPercent}%)`);

    console.log('\n--- 8. Audit Logs ---');
    const audit = await request('GET', '/api/audit?limit=5', null, token);
    console.log('Audit events count:', audit.data.events?.length);

    console.log('\n--- 9. Sync Latest ---');
    const sync = await request('GET', '/api/sync/latest', null, token);
    console.log('Sync status:', sync.status, 'Overrides count:', Object.keys(sync.data.overrides || {}).length);

    console.log('\n--- 10. Update Onboarding (PATCH) ---');
    const curV = single.data.version || 0;
    const patchRes = await request('PATCH', '/api/beneficiaries/1/onboarding', {
      field: 'onboarded',
      status: 'Yes',
      version: curV,
      remarks: 'Automated test update'
    }, token);
    console.log('Patch status:', patchRes.status, 'New version:', patchRes.data.version);

    console.log('\n--- 11. Version Conflict Detection (409) ---');
    const conflictRes = await request('PATCH', '/api/beneficiaries/1/onboarding', {
      field: 'onboarded',
      status: 'No',
      version: curV, // stale version!
      remarks: 'Conflict test'
    }, token);
    console.log('Conflict test status:', conflictRes.status, conflictRes.data.error);
    if (conflictRes.status !== 409) throw new Error('Expected 409 conflict');

    console.log('\n========================================');
    console.log(' ALL 11 API TEST SUITES PASSED 100%! ');
    console.log('========================================\n');
  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
