const axios = require('axios');
require('dotenv').config('./.env')

const repo = 'PssbleTrngle/PicoloBot';

axios.post(`https://api.github.com/repos/${repo}/dispatches`, { event_type: 'build-bot' }, {
    headers: {
        'Accept': 'application/vnd.github.everest-preview+json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    }
})
    .then(console.log(`Triggered Build`))
    .catch(e => console.error(e.message))