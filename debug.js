const axios = require('axios');

async function testAPI() {
  console.log('Testing Jamendo API...');
  try {
    const res = await axios.get('https://api.jamendo.com/v3.0/tracks/', {
      params: {
        client_id: '04a3a5a0',
        format: 'json',
        limit: 3,
        audioformat: 'mp32'
      }
    });
    console.log('Status:', res.data.headers.status);
    console.log('Total:', res.data.headers.results_count);
    if (res.data.results && res.data.results[0]) {
      const t = res.data.results[0];
      console.log('Sample track:', t.name);
      console.log('Audio URL:', t.audio);
      console.log('Audio DL:', t.audiodownload);
      console.log('Image:', t.album_image);
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
}
testAPI();
