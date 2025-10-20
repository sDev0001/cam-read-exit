import puppeteer from "puppeteer";

(async () => {
    const browser = await puppeteer.launch({
        headless: false,       
        slowMo: 80,            
        defaultViewport: null,
        args: ["--start-maximized", "--no-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();

    try {
        await page.goto("http://92.114.165.156:84/doc/index.html#/portal/login", {
            waitUntil: "networkidle2",
            timeout: 30000
        });

        const middleDiv = await page.$("div.middle");
        if (!middleDiv) {
            console.error("Nu am gasit div-ul cu clasa 'middle'");
            return;
        }

        const inputs = await middleDiv.$$("input");
        if (inputs.length < 2) {
            console.error("Nu am gasit suficiente inputuri in div.middle");
            return;
        }

        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type("admin", { delay: 80 });

        await inputs[1].click({ clickCount: 3 });
        await inputs[1].type("Video2025", { delay: 80 });

        console.log("Username si password completate in div.middle");

        let submitButton = await middleDiv.$('button[type="submit"], input[type="submit"]');
        if (!submitButton) {
            submitButton = await middleDiv.$("button"); // fallback
        }

        if (submitButton) {
            await page.evaluate(el => el.scrollIntoView({behavior:"smooth", block:"center"}), submitButton);
            await submitButton.click();
            console.log("Am dat click pe butonul de submit");
        } else {
            console.error("Nu am gasit butonul de submit in div.middle");
        }

        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });
        console.log("Pagina /preview s-a incarcat");

        await page.evaluate(() => {
            window.location.href = "http://92.114.165.156:84/doc/index.html#/intelligentDisplay";
        });

        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });
        console.log("Pagina /intelligentDisplay s-a incarcat. Browserul ramane deschis.");

        await new Promise(() => {});

    } catch (err) {
        console.error("Eroare in script:", err);
    }
})();
