const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 80,
    defaultViewport: null,
    args: ["--start-maximized", "--no-sandbox", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();

  try {
    await page.goto("http://92.114.165.156:84/doc/index.html#/portal/login", { waitUntil: "networkidle2" });

    const middleDiv = await page.$("div.middle");
    const inputs = await middleDiv.$$("input");

    await inputs[0].type("admin", { delay: 80 });
    await inputs[1].type("Video2025", { delay: 80 });

    let submitButton = await middleDiv.$('button[type="submit"], input[type="submit"]');
    if (!submitButton) submitButton = await middleDiv.$("button");
    await submitButton.click();

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Redirect direct catre /intelligentDisplay
    await page.evaluate(() => {
      window.location.href = "http://92.114.165.156:84/doc/index.html#/intelligentDisplay";
    });

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    console.log("Pagina /intelligentDisplay s-a incarcat. Browserul ramane deschis.");
    await new Promise(() => {});

  } catch (err) {
    console.error(err);
  }
})();
