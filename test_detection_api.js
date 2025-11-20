const fs = require('fs');
const https = require('https');

const imagePath = '/Users/mrarindampaul/Downloads/Images/ai_interior.jpg';
const imageData = fs.readFileSync(imagePath);

const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 9);

const body = [];
body.push(`--${boundary}`);
body.push('Content-Disposition: form-data; name="image"; filename="ai_interior.jpg"');
body.push('Content-Type: image/jpeg');
body.push('');
body.push(imageData.toString('binary'));
body.push(`--${boundary}--`);

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/v1/detect',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-token',
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  }
};

const req = require('http').request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('\nResponse:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
  process.exit(1);
});

req.write(Buffer.concat(body.map((part, idx) => {
  if (idx === 3) {
    return imageData;
  }
  return Buffer.from(part.toString('binary') + (idx < body.length - 1 ? '\r\n' : ''), 'binary');
})));

req.end();
