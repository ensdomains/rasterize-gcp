const fs = require('fs');
const { Cluster } = require('@zhaow-de/puppeteer-cluster');
const express = require('express');
const { createUniversalValidation, ValidationConfigs } = require('./validation');

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
  '--disable-features=AudioServiceOutOfProcess,VizDisplayCompositor',
  '--disable-hang-monitor',
  '--disable-notifications',
  '--disable-offer-store-unmasked-wallet-cards',
  '--disable-print-preview',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-speech-api',
  '--disable-sync',
  '--hide-scrollbars',
  '--ignore-gpu-blacklist',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
  '--no-first-run',
  '--no-pings',
  '--no-zygote',
  '--password-store=basic',
  '--proxy-bypass-list=*',
  '--proxy-server="direct://"',
  '--use-gl=swiftshader',
  '--use-mock-keychain',
  // Security-focused additions
  '--disable-javascript',
  '--disable-plugins',
  '--disable-web-security',
  '--disable-features=TranslateUI,BlinkGenPropertyTrees',
  '--block-new-web-contents',
];

const resolutionMultiplier = Object.freeze({
  low: 1,
  high: 2,
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
    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://ens-metadata-service.appspot.com; style-src 'unsafe-inline';">
        <meta http-equiv="X-Content-Type-Options" content="nosniff">
        <meta http-equiv="X-Frame-Options" content="DENY">
        <meta http-equiv="X-XSS-Protection" content="1; mode=block">
        <meta http-equiv="Referrer-Policy" content="no-referrer">
        <meta http-equiv="Permissions-Policy" content="geolocation=(), microphone=(), camera=()">
        <meta http-equiv="refresh" content="0; url=about:blank" disabled>
        <title>ENS Rasterization</title>
      </head>
      <body style="margin: 0;">
        <img src="${serviceUrl}/${networkName}/${contractAddress}/${tokenId}/image"/>
      </body>
    </html>
    `;

    let [_g, gotoError] = await handleWithError(page.setContent(htmlContent));
    if (gotoError) {
      return false;
    }
    // increase device scale factor for better image quality
    if (resolution > 1) {
      await page.setViewport({
        width: 2000,
        height: 2000,
        deviceScaleFactor: 2,
      });
    }
    // wait for svg to be retrieved and rendered
    const [_, waitError] = await handleWithError(
      page.waitForSelector('img', { visible: true, timeout: 5000 })
    );
    // if no result shows up then exit task
    if (waitError) {
      return false;
    }
    // if high res image in demand then resize the svg
    if (resolution > 1) {
      const imgContent = await page.$('img');
      await imgContent.evaluate((el, resolution) => {
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

  const validationMiddleware = createUniversalValidation(ValidationConfigs.production);

  const rasterize = async (req, res) => {
    // Apply validation middleware
    await new Promise((resolve, reject) => {
      validationMiddleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Use validated parameters
    const { contractAddress, networkName, tokenId } = req.validatedParams || req.body;
    if (!contractAddress || !networkName || !tokenId) {
      res.status(400).send('One or more parameters are missing');
      return;
    }
    const resolution =
      resolutionMultiplier[req.query.res] || resolutionMultiplier.low;
    const imageUrl = `${serviceUrl}/${networkName}/${contractAddress}/${tokenId}/image`;
    // execute task to retrieve screenshot image buffer back
    try {
      const imageBuffer = await cluster.execute({ url: imageUrl, resolution });
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
