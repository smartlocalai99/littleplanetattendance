const https = require('https');

const agent = new https.Agent({
  rejectUnauthorized: false
});

const urls = [
  'https://localhost:4443/FM220/gettmpl',
  'https://localhost:4443/FM220/MatchResult',
  'https://localhost:4443/FM220/GetMatchResult',
  'https://localhost:4443/FM220/MatchEx',
  'https://localhost:4443/FM220/MatchTmpl',
  'https://localhost:4443/FM220/match'
];

async function testUrl(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const options = {
      method,
      agent,
      headers: {}
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function run() {
  for (const url of urls) {
    console.log(`--- Probing GET ${url} ---`);
    const resGet = await testUrl(url, 'GET');
    console.log('GET Result:', JSON.stringify(resGet, null, 2));

    console.log(`--- Probing POST ${url} ---`);
    const resPost = await testUrl(url, 'POST', '{"test": true}');
    console.log('POST Result:', JSON.stringify(resPost, null, 2));
    console.log('\n=======================================\n');
  }
}

run();
