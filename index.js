// puppeteer-login.js
import puppeteer from "puppeteer";

(async () => {
  // Lanseaza Chromium vizibil si lent pentru a vedea ce face
  const browser = await puppeteer.launch({
    headless: false,           // <--- vizibil
    slowMo: 80,                // incetineste actiunile ca sa se vada
    defaultViewport: null,
    args: [
      "--start-maximized",     // maximizeaza fereastra
      "--no-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  try {
    const page = await browser.newPage();

    // mergi la pagina target
    await page.goto("http://92.114.165.156:84/doc/index.html#/portal/login", {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    // --- Selector fallback logic: incercam cateva variante comune ---
    // 1) campuri input[type="text"] si input[type="password"]
    // 2) campuri cu name/id cunoscute (username, user, login, password, pass)
    // 3) buton submit - <button type="submit"> sau buton cu text "Login"/"Sign in"/"Submit"

    // Gaseste si completeaza username
    const usernameSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[name="username"]',
      'input[name="user"]',
      'input[id*="user"]',
      'input[id*="login"]'
    ];
    let usernameFound = null;
    for (const sel of usernameSelectors) {
      if (await page.$(sel)) { usernameFound = sel; break; }
    }
    if (!usernameFound) {
      console.warn("Nu am gasit un selector username standard. Incerc sa completez primul input text gasit.");
      const firstText = await page.$('input');
      if (firstText) {
        usernameFound = await page.evaluate(el => {
          // return a constructed selector by index fallback
          el.setAttribute('data-pp-fallback','1'); 
          return 'input[data-pp-fallback="1"]';
        }, firstText);
      }
    }
    if (usernameFound) {
      await page.waitForSelector(usernameFound, {timeout:5000});
      await page.click(usernameFound, {clickCount: 3});
      await page.type(usernameFound, "admin", {delay: 80});
      console.log("Username introdus in:", usernameFound);
    } else {
      console.error("Eroare: nu am gasit campul pentru username.");
    }

    // Gaseste si completeaza password
    const passSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="pass"]',
      'input[id*="password"]'
    ];
    let passFound = null;
    for (const sel of passSelectors) {
      if (await page.$(sel)) { passFound = sel; break; }
    }
    if (passFound) {
      await page.waitForSelector(passFound, {timeout:5000});
      await page.click(passFound, {clickCount: 3});
      await page.type(passFound, "Video2025", {delay: 80});
      console.log("Password introdus in:", passFound);
    } else {
      console.error("Eroare: nu am gasit campul pentru parola.");
    }

    // Gaseste butonul de submit (incercam variante)
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Submit")',
      'button[class*="login"]',
      'button[id*="login"]'
    ];

    // Puppeteer nativ nu are :has-text() in querySelector; folosim fallback JS
    let buttonFound = null;
    for (const sel of ['button[type="submit"]', 'input[type="submit"]', 'button']) {
      const els = await page.$$(sel);
      if (!els || els.length === 0) continue;
      for (const el of els) {
        const txt = (await page.evaluate(e => e.innerText || e.value || "", el)).toLowerCase().trim();
        if (["login","log in","sign in","submit","ok"].some(k => txt.includes(k))) {
          buttonFound = el;
          break;
        }
      }
      if (buttonFound) break;
    }

    // Daca nu gasim un buton cu text, luam primul button sau input submit
    if (!buttonFound) {
      buttonFound = await page.$('button[type="submit"]') || await page.$('input[type="submit"]') || await page.$('button');
    }

    if (buttonFound) {
      // scroll la buton si click
      await page.evaluate(el => el.scrollIntoView({behavior:"smooth", block:"center"}), buttonFound);
      await buttonFound.click();
      console.log("Am dat click pe butonul de submit.");
    } else {
      console.error("Eroare: nu am gasit butonul de submit.");
    }

    // Optional: asteapta navigare / raspuns (daca exista redirect)
    try {
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 8000 });
      console.log("Navigare detectata dupa submit.");
    } catch (e) {
      // daca nu e redirect, e ok - poate se incarca ceva AJAX
      console.log("Nu s-a produs navigare (posibil AJAX). Ramanem pe pagina.");
    }

    // Lasam browserul deschis si scriptul pornit (asteptare infinita)
    console.log("Scriptul a terminat actiunile. Browserul ramane deschis.");
    // Blocheaza forever ca sa se vada browserul
    await new Promise(() => {});

  } catch (err) {
    console.error("Eroare in script:", err);
    // nu inchidem browserul automat, ca sa poti vedea starea
  }
})();
