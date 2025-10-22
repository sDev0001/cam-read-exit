// index4.js (ESM)
// npm install puppeteer axios
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve(process.cwd(), "index4.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

const CONFIG = {
  loginUrl: "http://92.114.165.156:84/doc/index.html#/portal/login",
  dataUrl: "http://92.114.165.156:84/doc/index.html#/intelligentDisplay",
  username: "admin",
  password: "Video2025",
  pollIntervalMs: 5000,
  gotoRetries: 5,
  gotoRetryDelayMs: 10000
};

function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }
function normalizePlate(raw){ if(!raw) return null; let s=String(raw).trim().toUpperCase(); return s.replace(/[^A-Z0-9\-]/g,"").replace(/\s+/g,""); }

async function postWithRetry(url, body, headers, maxRetries=3){
  let attempt=0;
  while(attempt<=maxRetries){
    try{
      return await axios.post(url, body, { headers, timeout: 10000 });
    }catch(e){
      attempt++;
      if(attempt>maxRetries) throw e;
      const backoff = Math.pow(2,attempt)*500 + Math.floor(Math.random()*500);
      log(`POST retry ${attempt}/${maxRetries} in ${backoff}ms: ${e.message}`);
      await sleep(backoff);
    }
  }
}

async function sendPlate(plate){
  // exemplu simplu (poți adapta)
  log(`Would send plate: ${plate}`);
  // uncomment and configure if you want to actually post:
  /*
  try {
    const resp = await postWithRetry(CONFIG.apiUrl, {plate_number: plate, timestamp: Date.now().toString(), camera_id: CONFIG.cameraId}, { authorization: `Bearer ${CONFIG.bearerToken}`, 'Content-Type': 'application/json' });
    log(`BQS resp ${resp.status}`);
  } catch(e) {
    log(`BQS error: ${e.message}`);
  }
  */
}

// safeGoto: goto + reload + retries + recreate page fallback
async function safeGoto(browser, pageRef, url, retries = CONFIG.gotoRetries) {
  let page = pageRef;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`safeGoto: navigating to ${url} (attempt ${attempt}/${retries})`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      log(`safeGoto: loaded ${url} (attempt ${attempt})`);
      return page; // success
    } catch (err) {
      log(`safeGoto error (attempt ${attempt}): ${err.message}`);
      // try reload
      try {
        log(`Attempting reload...`);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => log(`reload failed: ${e.message}`));
      } catch(e) {}
      // if last attempt, recreate a fresh page
      if (attempt === retries) {
        try {
          log("safeGoto: last attempt failed -> closing page and opening a fresh one");
          try { await page.close(); } catch {}
          page = await browser.newPage();
          await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
          page.setDefaultTimeout(60000);
          page.setDefaultNavigationTimeout(60000);
        } catch (e) {
          log(`Error creating fresh page: ${e.message}`);
        }
        log(`Waiting ${CONFIG.gotoRetryDelayMs}ms before retrying after recreate`);
        await sleep(CONFIG.gotoRetryDelayMs + Math.floor(Math.random()*1500));
      } else {
        // wait and retry
        const waitMs = err.message.includes("ERR_ADDRESS_UNREACHABLE") ? CONFIG.gotoRetryDelayMs * 2 : CONFIG.gotoRetryDelayMs;
        log(`Waiting ${waitMs}ms before next attempt`);
        await sleep(waitMs + Math.floor(Math.random()*1500));
      }
    }
  }
  // final attempt: try once more on the current page
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  } catch (e) {
    throw new Error(`safeGoto failed for ${url}: ${e.message}`);
  }
}

// Try to find login area inside main page OR inside an iframe. Return an object {type: 'page'|'frame', ctx}
async function findMiddleContext(page) {
  // 1) try main page
  try {
    const middle = await page.$("div.middle");
    if (middle) return { type: "page", ctx: page, middleEl: middle };
  } catch(e){}

  // 2) try frames: iterate and search for div.middle inside each frame
  const frames = page.frames();
  for (const f of frames) {
    try {
      const el = await f.$("div.middle");
      if (el) return { type: "frame", ctx: f, middleEl: el };
    } catch (e){}
  }

  // 3) fallback: not found
  return null;
}

// login using original logic: look for div.middle, inputs inside, type, and click submit (many fallbacks)
async function doLogin(browser, page) {
  page = await safeGoto(browser, page, CONFIG.loginUrl);
  // wait a bit for JS to render
  await sleep(500);
  // find context that contains div.middle
  const ctxInfo = await findMiddleContext(page);
  if (!ctxInfo) {
    // debug: print short HTML to logs so we can inspect
    const html = await page.content();
    log("ERROR: div.middle not found on page or frames. Page HTML (first 2000 chars):\n" + html.slice(0,2000));
    throw new Error("div.middle not found (main page or frames). See logs.");
  }

  const ctx = ctxInfo.ctx; // either Page or Frame
  log(`Login context found in: ${ctxInfo.type}`);

  // wait and select inputs inside the middle
  // We use selector relative to the middle element: evaluate inside frame/page to get inputs
  const inputs = await ctx.$$eval("div.middle input", els => els.map(e => {
    // return some hints
    return { tag: e.tagName, type: e.type || null, name: e.name || null, id: e.id || null, placeholder: e.getAttribute("placeholder") || null };
  })).catch(() => []);

  log(`Found ${inputs.length} input(s) inside div.middle (hints): ${JSON.stringify(inputs.slice(0,5))}`);

  if (inputs.length < 2) {
    // try to find ANY input on page as fallback
    const fallbackInputs = await ctx.$$eval("input", els => els.slice(0,4).map(e => ({tag:e.tagName,type:e.type,name:e.name,id:e.id,placeholder:e.placeholder}))).catch(()=>[]);
    log("Fallback: found inputs on page/frame: " + JSON.stringify(fallbackInputs.slice(0,6)));
    // still continue to try to find username/password selectors by common names
  }

  // Now fill username and password. Prefer precise selectors if available, else use the first two inputs inside div.middle
  // Try common username/password selectors first (works in many systems)
  const usernameSelectors = ['div.middle input[placeholder="User Name"]', 'div.middle input[name="username"]', 'div.middle input#username', 'div.middle input[type="text"]', 'input[name="username"]', 'input#username', 'input[placeholder*="User"]'];
  const passwordSelectors = ['div.middle input[placeholder="Password"]', 'div.middle input[name="password"]', 'div.middle input#password','div.middle input[type="password"]', 'input[name="password"]', 'input#password', 'input[placeholder*="Pass"]'];

  let filled = {u:false,p:false};

  for (const sel of usernameSelectors) {
    try {
      const exists = await ctx.$(sel);
      if (exists) {
        await exists.click({ clickCount: 3 }).catch(()=>{});
        await sleep(150 + Math.floor(Math.random()*200));
        await exists.type(CONFIG.username, { delay: 60 });
        filled.u = true;
        log(`Typed username into selector: ${sel}`);
        break;
      }
    } catch(e){}
  }

  for (const sel of passwordSelectors) {
    try {
      const exists = await ctx.$(sel);
      if (exists) {
        await exists.click({ clickCount: 3 }).catch(()=>{});
        await sleep(150 + Math.floor(Math.random()*200));
        await exists.type(CONFIG.password, { delay: 60 });
        filled.p = true;
        log(`Typed password into selector: ${sel}`);
        break;
      }
    } catch(e){}
  }

  // If not filled using common selectors, fallback to using the first two input elements inside div.middle
  if (!filled.u || !filled.p) {
    try {
      // get element handles for inputs inside div.middle
      const handles = await ctx.$$("div.middle input");
      if (handles && handles.length >= 2) {
        if (!filled.u) {
          await handles[0].click({ clickCount: 3 }).catch(()=>{});
          await sleep(120);
          await handles[0].type(CONFIG.username, { delay: 60 });
          filled.u = true;
          log("Typed username into div.middle input[0]");
        }
        if (!filled.p) {
          await handles[1].click({ clickCount: 3 }).catch(()=>{});
          await sleep(120);
          await handles[1].type(CONFIG.password, { delay: 60 });
          filled.p = true;
          log("Typed password into div.middle input[1]");
        }
      } else {
        log("Fallback handles length < 2; will try other page inputs");
        const firstTwo = await ctx.$$("input");
        if (!filled.u && firstTwo[0]) { await firstTwo[0].type(CONFIG.username, { delay: 60 }); filled.u = true; log("Typed username into first input on page/frame"); }
        if (!filled.p && firstTwo[1]) { await firstTwo[1].type(CONFIG.password, { delay: 60 }); filled.p = true; log("Typed password into second input on page/frame"); }
      }
    } catch(e){
      log("Error fallback typing: " + e.message);
    }
  }

  if (!filled.u || !filled.p) {
    const pageHtml = await ctx.content();
    log("Unable to fill username/password automatically. HTML snippet:\n" + pageHtml.slice(0,2000));
    throw new Error("Failed to locate or fill username/password inputs");
  }

  // Find submit button: several fallbacks
  const submitSelectors = [
    'div.middle button[type="submit"]',
    'div.middle input[type="submit"]',
    'div.middle button',
    'button[type="submit"]',
    'input[type="submit"]',
    'button.login',
    'button.btn',
    'button'
  ];

  let clicked = false;
  for (const sel of submitSelectors) {
    try {
      const el = await ctx.$(sel);
      if (el) {
        // scroll into view if possible (works if ctx is page; if frame, evaluate)
        try {
          await el.evaluate(e => e.scrollIntoView({ behavior: "smooth", block: "center" }));
        } catch(_) {}
        await sleep(150);
        // click and wait for navigation (best effort)
        try {
          log(`Attempting click on submit selector: ${sel}`);
          const navPromise = (ctx === page) ? page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(()=>{}) : ctx.waitForNavigation ? ctx.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(()=>{}) : Promise.resolve();
          await Promise.all([navPromise, el.click().catch(()=>{})]);
        } catch(e) {
          // click might not cause navigation; still fine
          try { await el.click().catch(()=>{}); } catch(_) {}
        }
        clicked = true;
        log(`Clicked submit using selector: ${sel}`);
        break;
      }
    } catch(e){}
  }

  if (!clicked) {
    // debug: dump small HTML
    const pageHtml = await ctx.content();
    log("Submit button not found. HTML snippet:\n" + pageHtml.slice(0,2000));
    throw new Error("Submit button not found in div.middle or frame. See logs for HTML.");
  }

  // small wait after click
  await sleep(700);
  log("Login attempt done; returning control");
  return { page: page, ctxType: ctxInfo.type };
}

// scan page for plates (original selectors)
async function scanAndHandlePlates(page, processedSet) {
  try {
    const items = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.id-realtime-wrap'));
      const out = [];
      rows.forEach(element => {
        const contentNodes = Array.from(element.querySelectorAll('.id-realtime-bottom-content-trans'))
          .map(n => n.textContent ? n.textContent.trim() : '')
          .filter(Boolean);
        const dateTime = element.querySelector('.id-realtime-bottom-header > span:nth-child(2)')?.textContent?.trim() || null;
        if (contentNodes.length > 0) {
          out.push({ rawPlate: contentNodes[0], dateTime });
        }
      });
      return out;
    });
    if (!items || !items.length) return;
    for (const it of items) {
      const plate = normalizePlate(it.rawPlate);
      if (!plate) continue;
      const key = `${plate}_${it.dateTime || "noTime"}`;
      if (processedSet.has(key)) continue;
      processedSet.add(key);
      log(`Detected plate: ${plate} time:${it.dateTime}`);
      // send to API or perform action
      try { await sendPlate(plate); } catch(e){ log("sendPlate error: " + e.message); }
    }
  } catch(e){
    log("scanAndHandlePlates error: " + e.message);
  }
}

// Main
(async () => {
  log("Starting index4 script");
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 60,
    defaultViewport: null,
    args: ["--start-maximized", "--no-sandbox", "--disable-dev-shm-usage"]
  });

  let page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  // Try login with retries (wrap whole doLogin in attempts)
  const MAX_LOGIN_ATTEMPTS = 5;
  let logged = false;
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS && !logged; attempt++) {
    try {
      log(`Login attempt ${attempt}/${MAX_LOGIN_ATTEMPTS}`);
      const res = await doLogin(browser, page);
      // doLogin returns page and context; ensure page ref updated (doLogin may have recreated page)
      if (res && res.page) page = res.page;
      logged = true;
      log("Login successful");
      break;
    } catch (e) {
      log(`Login attempt ${attempt} failed: ${e.message}`);
      // wait, maybe network glitch
      await sleep(CONFIG.gotoRetryDelayMs + Math.floor(Math.random()*2000));
      // try to recreate page if closed
      try {
        if (page.isClosed && page.isClosed()) {
          page = await browser.newPage();
          page.setDefaultTimeout(60000);
        }
      } catch {}
      if (attempt === MAX_LOGIN_ATTEMPTS) {
        log("Max login attempts reached, exiting.");
        await browser.close();
        process.exit(1);
      }
    }
  }

  // Navigate to data page (use safeGoto to handle unreachable)
  try {
    page = await safeGoto(browser, page, CONFIG.dataUrl);
    log("Navigated to data page successfully");
  } catch (e) {
    log("Cannot open dataUrl: " + e.message);
    await browser.close();
    process.exit(1);
  }

  // Polling loop for plates
  const processedSet = new Set();
  setInterval(async () => {
    try {
      // Ensure still on data page; if not try to re-open and relogin if necessary
      try {
        await page.waitForSelector(".id-realtime-wrap", { timeout: 5000 });
      } catch {
        log("id-realtime-wrap not found on page - trying to ensure logged in and reload");
        try {
          page = await safeGoto(browser, page, CONFIG.dataUrl);
        } catch (e) {
          log("safeGoto to dataUrl failed: " + e.message);
        }
      }
      await scanAndHandlePlates(page, processedSet);
    } catch (e) {
      log("Polling loop error: " + e.message);
    }
  }, CONFIG.pollIntervalMs);

  // keep process alive
})();
