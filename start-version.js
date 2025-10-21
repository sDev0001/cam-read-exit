import puppeteer from "puppeteer";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 80,
    defaultViewport: null,
    args: ["--start-maximized", "--no-sandbox", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();

  // Verifică dacă page.waitForTimeout există
  const wait = typeof page.waitForTimeout === "function"
    ? (ms) => page.waitForTimeout(ms)
    : delay;

  // Timeout-uri mai mari global
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  try {
    await page.goto("http://92.114.165.156:84/doc/index.html#/portal/login", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await page.waitForSelector("div.middle", { visible: true, timeout: 60000 });
    const middleDiv = await page.$("div.middle");
    if (!middleDiv) {
      console.error("Nu am gasit div-ul cu clasa 'middle'");
      await browser.close();
      return;
    }

    await page.waitForSelector("div.middle input", { visible: true, timeout: 60000 });
    const inputs = await middleDiv.$$("input");
    if (inputs.length < 2) {
      console.error("Nu am gasit suficiente inputuri in div.middle");
      await browser.close();
      return;
    }

    await wait(500);

    await inputs[0].focus();
    await inputs[0].click({ clickCount: 3 });
    await wait(200);
    await inputs[0].type("admin", { delay: 80 });

    await inputs[1].focus();
    await inputs[1].click({ clickCount: 3 });
    await wait(200);
    await inputs[1].type("Video2025", { delay: 80 });

    console.log("Username si password completate in div.middle");

    let submitButton = await middleDiv.$('button[type="submit"], input[type="submit"]');
    if (!submitButton) {
      submitButton = await middleDiv.$("button");
    }

    if (!submitButton) {
      await wait(500);
      submitButton = await page.$("button.btn, button.login, button[type=button]");
    }

    if (submitButton) {
      await page.evaluate(el => el.scrollIntoView({ behavior: "smooth", block: "center" }), submitButton);
      await wait(300);

      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
        submitButton.click()
      ]);

      console.log("Am dat click pe butonul de submit si aștept navigația");
    } else {
      console.error("Nu am gasit butonul de submit in div.middle");
      await browser.close();
      return;
    }

    await wait(500);
    await page.goto("http://92.114.165.156:84/doc/index.html#/intelligentDisplay", {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    console.log("Pagina /intelligentDisplay s-a incarcat. Browserul ramane deschis.");

    await new Promise(() => {}); // ține browserul deschis

  } catch (err) {
    console.error("Eroare in script:", err);
    await browser.close();
  }
})();
