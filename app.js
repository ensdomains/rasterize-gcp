const fs = require('fs');
const { Cluster } = require('@zhaow-de/puppeteer-cluster');
const express = require('express');

// original gcp endpoint of metadata service
const serviceUrl = 'https://ens-metadata-service.appspot.com';
// specific chromium flags to remove overhead from headless browser initialization
const minimal_args = [
  '--autoplay-policy=user-gesture-required',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-domain-reliability',
  '--disable-extensions',
  '--disable-features=AudioServiceOutOfProcess',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-notifications',
  '--disable-offer-store-unmasked-wallet-cards',
  '--disable-popup-blocking',
  '--disable-print-preview',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-setuid-sandbox',
  '--disable-speech-api',
  '--disable-sync',
  '--hide-scrollbars',
  '--ignore-gpu-blacklist',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
  '--no-first-run',
  '--no-pings',
  '--no-sandbox',
  '--no-zygote',
  '--password-store=basic',
  '--proxy-bypass-list=*',
  '--proxy-server="direct://"',
  '--use-gl=swiftshader',
  '--use-mock-keychain',
];

const resolutionMultiplier = Object.freeze({
  low: 1,
  high: 4,
});

// relative path causes more memory usage
const tempData = '/tmp';

// check if /tmp folder exist if not create one
if (!fs.existsSync(tempData)) {
  fs.mkdirSync(tempData);
}

// retrieve promise result or error in array
const handleWithError = (promise) => {
  return promise
    .then((data) => [data, undefined])
    .catch((error) => Promise.resolve([undefined, error]));
};

(async () => {
  // create puppeteer cluster for parallel task execution
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 10,
    puppeteerOptions: {
      args: minimal_args,
      userDataDir: tempData,
    },
  });
  // add screenshot task for each cluster
  await cluster.task(async ({ page, data: { url, resolution } }) => {
    await page.goto(url);
    // increase device scale factor for better image quality
    if (resolution > 1) {
      await page.setViewport({ width: 2000, height: 2000, deviceScaleFactor: 2 });
    }
    // wait for svg to be retrieved and rendered
    const [_, waitError] = await handleWithError(
      page.waitForSelector('svg', { visible: true, timeout: 5000 })
    );
    // if no result shows up then exit task
    if (waitError) {
      return false;
    }
    // if high res image in demand then resize the svg
    if (resolution > 1) {
      const svgContent = await page.$('svg');
      await svgContent.evaluate((el, resolution) => {
        el.style.width = `${270 * resolution}px`;
        el.style.height = `${270 * resolution}px`;
      }, resolution);
    }
    // if image exist take a screenshot
    const imageBuffer = await page.screenshot({
      clip: {
        x: 0,
        y: 0,
        width: 270 * resolution,
        height: 270 * resolution,
      },
    });
    return imageBuffer;
  });

const rasterize = async (req, res) => {
    const { contractAddress, networkName, tokenId } = req.body;
    if (!contractAddress || !networkName || !tokenId) {
      res.status(400).send('One or more parameters are missing');
      return;
    }
    const resolution =
      resolutionMultiplier[req.query.res] || resolutionMultiplier.low;
    const svgUrl = `${serviceUrl}/${networkName}/${contractAddress}/${tokenId}/image`;
    // execute task to retrieve screenshot image buffer back
    try {
      const imageBuffer = await cluster.execute({ url: svgUrl, resolution });
      if (imageBuffer === false) {
        res.status(404).send(`Not found`);
        return;
      }
      res.set('Content-Type', 'image/png');
      res.send(imageBuffer);
    } catch (error) {
      console.warn('warning:', error);
      res.status(500).send(error);
    }
  };

  const app = express();

  app.use(express.json());
  app.post('/rasterize', rasterize);

  const port = process.env.PORT || 8080;

  app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
  });
})();
