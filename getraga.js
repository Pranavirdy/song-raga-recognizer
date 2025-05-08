const puppeteer = require('puppeteer');
const SerpApi = require('google-search-results-nodejs');
const search = new SerpApi.GoogleSearch('5868276f091c30f7fad6055ceb78fbd42807a277254265397ca8e72fb18170c2'); // Replace with your key

const getRagaInfo = async (songName) => {
  try {
    // Step 1: Search song on Karnatik using SerpAPI
    const searchQuery = `${songName} site:karnatik.com`;

    const karnatikLink = await new Promise((resolve, reject) => {
      search.json({
        q: searchQuery,
        engine: 'google'
      }, (data) => {
        const firstLink = data.organic_results?.[0]?.link;
        if (!firstLink) reject('No Karnatik link found.');
        else resolve(firstLink);
      });
    });

    // Step 2: Scrape Raga Info using Puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(karnatikLink, { waitUntil: 'domcontentloaded' });

    const raga = await page.evaluate(() => {
      const text = document.body.innerText;
      const ragaLine = text.split('\n').find(line => line.toLowerCase().includes('ragam') || line.toLowerCase().includes('raagam'));
      return ragaLine || 'Raga info not found';
    });

    await browser.close();
    console.log('🎵 Raga:', raga);
  } catch (err) {
    console.error('Error fetching raga info:', err);
  }
};

// Example test
getRagaInfo('Vatapi Ganapatim');
