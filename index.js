
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
const puppeteer = require('puppeteer');
const { getJson } = require('serpapi');

const app = express();
const port = process.env.PORT || 3000;

// ACRCloud credentials
const host = 'identify-ap-southeast-1.acrcloud.com';
const accessKey = process.env.ACR_ACCESS_KEY;
const accessSecret = process.env.ACR_ACCESS_SECRET;
const serpApiKey = process.env.SERPAPI_KEY;


const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer setup
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(16).toString('hex');
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// 🧠 Scrape raga info from Carnatik song page using Puppeteer
const scrapeRagaFromKarnatik = async (url) => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const pageText = await page.evaluate(() => document.body.innerText);
    const lines = pageText.split('\n').map(line => line.trim()).filter(Boolean);

    const ragaLine = lines.find(line =>
      line.toLowerCase().includes('ragam') || line.toLowerCase().includes('raagam')
    );

    await browser.close();
    return ragaLine || 'Raga not found';
  } catch (err) {
    await browser.close();
    return 'Error scraping Carnatik';
  }
};

// 🔍 Search Karnatik for song using SerpAPI
const findKarnatikRaga = async (songName) => {
  try {
    const searchResults = await getJson({
      q: `${songName} site:karnatik.com`,
      api_key: serpApiKey,
    });

    const firstResult = searchResults.organic_results?.[0];
    if (firstResult && firstResult.link.includes('karnatik.com')) {
      return await scrapeRagaFromKarnatik(firstResult.link);
    } else {
      return 'No relevant Carnatik raagam found';
    }
  } catch (err) {
    return 'Error fetching from SerpAPI';
  }
};

// 🎵 Upload and Identify Endpoint
app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).send({ error: 'No audio file uploaded' });

  const filePath = path.resolve(__dirname, req.file.path);
  const buffer = fs.readFileSync(filePath);
  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`;
  const signature = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64');

  const form = new FormData();
  form.append('access_key', accessKey);
  form.append('sample_bytes', buffer.length);
  form.append('sample', buffer, { filename: req.file.filename, contentType: 'audio/mpeg' });
  form.append('timestamp', timestamp);
  form.append('signature', signature);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');

  try {
    const response = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const result = await response.json();
    console.log('ACRCloud result:', result);

    if (result.status.code === 0 && result.metadata?.music?.[0]) {
      const title = result.metadata.music[0].title;
      const fullTitle = `${title}`;

      const raga = await findKarnatikRaga(fullTitle);
      res.send({ title: fullTitle, raga });
    } else {
      res.status(400).send({ error: 'Could not identify song' });
    }
  } catch (err) {
    res.status(500).send({ error: 'Audio recognition error' });
  } finally {
    fs.unlinkSync(filePath);
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('Raga Recognition Server is running.');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
