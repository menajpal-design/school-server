import http from 'http';
import https from 'https';
import { URL } from 'url';

const baseUrl = process.env.SMOKE_TEST_URL || 'http://159.65.227.91:5000';
const testHost = process.env.SMOKE_TEST_HOST;
const timeoutMs = Number(process.env.SMOKE_TEST_TIMEOUT || '15000');

const endpoints = ['/api/health', '/api/'];

const request = (path: string): Promise<{ status: number; body: string }> => {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(path, baseUrl);
      const lib = url.protocol === 'https:' ? https : http;
      const options: any = {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json,text/html,*/*',
        },
      };
      if (testHost) options.headers.Host = testHost;

      const req = lib.request(url, options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      });
      req.on('timeout', () => {
        req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
      });
      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
};

const parseJson = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const run = async () => {
  console.log(`Running smoke tests against ${baseUrl}`);
  if (testHost) console.log(`Using Host header: ${testHost}`);

  for (const endpoint of endpoints) {
    const fullUrl = new URL(endpoint, baseUrl).toString();
    process.stdout.write(`- Checking ${fullUrl} ... `);
    try {
      const result = await request(endpoint);
      if (result.status >= 200 && result.status < 300) {
        const body = parseJson(result.body);
        if (endpoint === '/api/health' && body?.status !== 'OK') {
          console.error('FAIL');
          console.error(`  Unexpected health response: ${result.body}`);
          process.exit(1);
        }
        console.log('OK');
      } else {
        console.error('FAIL');
        console.error(`  Status ${result.status}: ${result.body}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('FAIL');
      console.error(`  ${err.message || err}`);
      process.exit(1);
    }
  }

  console.log('Smoke test passed. Your server is responding correctly.');
  process.exit(0);
};

run().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
