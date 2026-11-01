// Toets van de kaartpagina in een echte Chromium (Playwright), zonder internet: Supabase en de kaarttegels worden
// nagebootst, Leaflet komt uit leaflet/ in deze repo. De codes hier zijn verzonnen.
//   npm i playwright && npx playwright install chromium   (eenmalig)
//   node toets/toets.js [map met index.html] [map voor schermafdrukken]
const {chromium} = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const SITE = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const UIT = process.argv[3] || path.join(os.tmpdir(), 'koffer-kaart-shots');
fs.mkdirSync(UIT, {recursive: true});
let goed = 0, fout = 0;
const t = (naam, ok, info = '') => { ok ? goed++ : fout++; console.log((ok ? 'goed ' : 'FOUT ') + naam + (ok ? '' : '  -> ' + info)); };

const nu = 1793580000;
const instelling = {grens: null, zicht: 1, zones: null, versie: 3, volgen: 1, max_kmh: 0, cirkel_m: 75, spoor_min: 15,
  ververs_s: 0, bijgewerkt: '2026-11-02T00:00:00+00:00', interval_s: 15, grens_actie: 1, vertraging_s: 60,
  grens_wacht_s: 10, spoor_kijkers: false, zones_kijkers: true};
const leider = () => ({rol: 'leider', naam: 'RAF Challenge case', kijk_code: 'kijkcode1234', nu, gezien: nu - 8, spel: 'TRANSPORT',
  fase: 'SPEELT', accu: 87, sats: 9, fix: true, instelling: JSON.parse(JSON.stringify(instelling)),
  pos: {lat: 51.9054, lon: 4.4667, t: nu - 9, nauw: 6, kmh: 4.2, koers: 90, sats: 9},
  spoor: [[51.9042, 4.4650, nu - 120], [51.9048, 4.4660, nu - 60], [51.9054, 4.4667, nu - 9]]});
const kijkers = {
  live: {rol: 'kijker', naam: 'RAF Challenge case', zicht: 1, nu, gezien: nu - 8, spel: 'TRANSPORT', fase: 'SPEELT', vertraging: 0,
    ververs: 0, pos: {lat: 51.9054, lon: 4.4667, t: nu - 9}, spoor: [], grens: {soort: 'cirkel', lat: 51.9042, lon: 4.4660, r: 400},
    zones: [{naam: 'ALFA', lat: 51.9072, lon: 4.4690, r: 25, soort: 'cp'}, {naam: 'EIND', lat: 51.9092, lon: 4.4620, r: 30, soort: 'eind'}]},
  vaag: {rol: 'kijker', naam: 'RAF Challenge case', zicht: 3, nu, gezien: nu - 8, spel: 'DEFUSE', fase: 'SPEELT', vertraging: 60,
    ververs: 0, pos: {lat: 51.9057, lon: 4.4670, t: nu - 70, cirkel: 75}, spoor: [], grens: null, zones: null},
  verborgen: {rol: 'kijker', naam: 'RAF Challenge case', zicht: 0, nu, gezien: nu - 8, spel: '', fase: null, grens: null, zones: null},
  rust: {rol: 'kijker', naam: 'RAF Challenge case', zicht: 1, nu, gezien: nu - 600, spel: '', fase: null, vertraging: 0, ververs: 0,
    pos: {lat: 51.9054, lon: 4.4667, t: nu - 86400}, spoor: [], grens: null, zones: null},
  weg: {rol: 'kijker', naam: 'RAF Challenge case', zicht: 1, nu, gezien: nu - 3000, spel: '', fase: null, vertraging: 0, ververs: 0,
    pos: null, spoor: [], grens: null, zones: null},
};
const instelVerzoeken = [], tegelReferers = new Set(), vreemd = [];

const SOORT = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png'};
const server = http.createServer((q, r) => {
  const pad = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(SITE, pad === '/' ? 'index.html' : pad);
  if (!f.startsWith(SITE + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'Content-Type': SOORT[path.extname(f)] || 'application/octet-stream'});
  r.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(k => server.listen(8765, k));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2,
    geolocation: {latitude: 51.9032, longitude: 4.4640}, permissions: ['geolocation']});
  let soort = 'live';
  const leiderNu = leider();
  // Alles wat niet localhost, de tegels of Supabase is, hoort de pagina niet op te halen
  await ctx.route(u => !/^http:\/\/localhost:8765\//.test(u.href) && !/^https:\/\/(tile\.openstreetmap\.org|wrkoeoharqyjjjnlihgu\.supabase\.co)\//.test(u.href),
    route => { vreemd.push(route.request().url()); route.abort(); });
  await ctx.route('https://tile.openstreetmap.org/**', route => {
    tegelReferers.add(route.request().headers().referer || '(geen)');
    route.fulfill({status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')});
  });
  await ctx.route('https://wrkoeoharqyjjjnlihgu.supabase.co/rest/v1/rpc/**', route => {
    const req = route.request();
    const h = req.headers();
    const body = JSON.parse(req.postData() || '{}');
    const fn = req.url().split('/rpc/')[1];
    const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'};
    if (req.method() === 'OPTIONS') return route.fulfill({status: 200, headers: cors, body: ''});
    if (h.apikey !== 'sb_publishable_3KEKBN8KSyfbDGV23aD0_A_Lk0ZgBG_') return route.fulfill({status: 401, headers: cors, body: '{}'});
    if (fn === 'koffer_kaart') {
      if (body.p_code === 'leidercode-xyz') return route.fulfill({status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(leiderNu)});
      if (body.p_code === 'kijkcode1234') return route.fulfill({status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(kijkers[soort])});
      return route.fulfill({status: 403, headers: cors, contentType: 'application/json', body: '{"code":"28000","message":"onbekende code"}'});
    }
    if (fn === 'koffer_instel') {
      instelVerzoeken.push(body);
      if (body.p_leider_code !== 'leidercode-xyz') return route.fulfill({status: 403, headers: cors, body: '{}'});
      Object.assign(leiderNu.instelling, body.p_instelling);
      // zoals de echte functie: bijgewerkt = now(), in de vorm van Postgres (microseconden)
      leiderNu.instelling.bijgewerkt = new Date(leiderNu.nu * 1000).toISOString().replace(/\.(\d{3})Z$/, '.$1456+00:00');
      return route.fulfill({status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(leiderNu)});
    }
    route.fulfill({status: 404, headers: cors, body: '{}'});
  });
  const page = await ctx.newPage();
  const fouten = [];
  page.on('pageerror', e => fouten.push(e.message));
  page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
  const tekst = sel => page.$eval(sel, e => e.textContent);

  // 1. Kijker, live
  await page.goto('http://localhost:8765/#k=kijkcode1234');
  await page.waitForFunction(() => document.getElementById('pil').textContent.includes('LIVE'));
  t('Leaflet uit de eigen map geladen', await page.evaluate(() => typeof L === 'object' && L.version === '1.9.4'));
  t('kijker live: LIVE en het spel', (await tekst('#regels')).includes('TRANSPORT · SPEELT'), await tekst('#regels'));
  t('kijker live: de koffer als stip op de kaart', await page.$('.koffer-ico') !== null);
  t('kijker live: grens en zones (ALFA, EIND) op de kaart', (await page.$$('.zone-label')).length === 2 &&
    (await page.$$('path.leaflet-interactive')).length >= 3);
  t('kijker: geen instellingen', await page.$eval('#bInstel', e => e.hidden));
  await page.click('#bIk');
  await page.waitForFunction(() => document.getElementById('regels').textContent.includes('Afstand'));
  t('mijn plek: afstand tot de koffer', /Afstand.*m/.test(await tekst('#regels')), await tekst('#regels'));
  await page.screenshot({path: path.join(UIT, 'kijker_live.png')});

  // 2. Kijker, vaag
  soort = 'vaag';
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('pil').textContent.includes('VAAG'));
  t('kijker vaag: een cirkel en geen stip', await page.$('.koffer-ico') === null &&
    (await tekst('#regels')).includes('ergens in de cirkel (75 m)'), await tekst('#regels'));
  t('kijker vaag: afstand tot de cirkel', (await tekst('#regels')).includes('tot de cirkel'), await tekst('#regels'));
  await page.screenshot({path: path.join(UIT, 'kijker_vaag.png')});

  // 3. Kijker, verborgen
  soort = 'verborgen';
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('pil').textContent.includes('NIETS'));
  t('kijker verborgen: geen plek, wel de uitleg', (await tekst('#regels')).includes('verborgen') && await page.$('.koffer-ico') === null,
    await tekst('#regels'));

  // 3b. Kijker, koffer in rust (geen spel, 10 min geleden gemeld): verbonden, niet OFFLINE; 50 min niets = OFFLINE
  soort = 'rust';
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('regels').textContent.includes('geen spel open'));
  t('kijker in rust: niet OFFLINE', !(await tekst('#pil')).includes('OFFLINE') && (await tekst('#regels')).includes('10 min geleden'),
    await tekst('#pil') + ' | ' + await tekst('#regels'));
  soort = 'weg';
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('pil').textContent.includes('OFFLINE'));
  t('kijker: 50 min geen melding = OFFLINE', (await tekst('#regels')).includes('niet verbonden'), await tekst('#regels'));

  // 4. De spelleider
  await page.goto('about:blank');
  await page.goto('http://localhost:8765/#l=leidercode-xyz');
  await page.waitForFunction(() => document.getElementById('pil').textContent.includes('SPELLEIDER'));
  t('leider: de stand van de koffer', /accu 87 %.*9 satellieten/.test(await tekst('#regels')) &&
    (await tekst('#regels')).includes('tijdens een spel, elke 15 s'), await tekst('#regels'));
  t('leider: spoor en nauwkeurigheid op de kaart', (await page.$$('path.leaflet-interactive')).length >= 2);
  await page.click('#bInstel');
  await page.waitForSelector('#instel.open');
  t('leider: instellingen open, cirkelstraal pas bij Vaag', !(await page.$('text=Straal van de vage cirkel')));
  await page.screenshot({path: path.join(UIT, 'leider_instellingen.png')});
  await page.click('.keuze button:has-text("Vaag")');
  t('leider: Vaag gekozen = cirkelstraal en vertraging verschijnen', !!(await page.$('text=Straal van de vage cirkel')) &&
    !!(await page.$('text=Vertraging')));
  await page.evaluate(() => {
    const i = VELDEN.findIndex(v => v.k === 'cirkel_m');
    const el = document.querySelector('input[type=range][data-i="' + i + '"]');
    el.value = 150;
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  // een cirkel als speelgebied: tik op de kaart
  await page.click('button[data-actie="cirkel"]');
  t('leider: tekenbalk zegt wat je doet', (await tekst('#tekenUitleg')).includes('midden van het speelgebied'));
  await page.mouse.click(200, 300);
  await page.waitForSelector('#instel.open');
  t('leider: cirkel gezet, met een straalschuif', (await tekst('#blad')).includes('Cirkel van 300 m') && !!(await page.$('#grensR')));
  // een zone
  await page.click('button[data-actie="zone"]');
  await page.mouse.click(250, 260);
  await page.waitForSelector('#instel.open');
  t('leider: zone CP1 erbij', await page.$eval('input[data-zk="naam"]', e => e.value) === 'CP1');
  await page.selectOption('select[data-zk="soort"]', 'eind');
  await page.screenshot({path: path.join(UIT, 'leider_getekend.png'), fullPage: false});
  await page.click('#bOpslaan');
  await page.waitForFunction(() => !document.getElementById('instel').classList.contains('open'));
  const v = instelVerzoeken[instelVerzoeken.length - 1] || {};
  const w = v.p_instelling || {};
  t('opslaan: alleen wat veranderde (zicht, cirkel, grens, zones)', JSON.stringify(Object.keys(w).sort()) ===
    JSON.stringify(['cirkel_m', 'grens', 'zicht', 'zones']), JSON.stringify(w));
  t('opslaan: de waarden kloppen', w.zicht === 3 && w.cirkel_m === 150 && w.grens.soort === 'cirkel' && w.grens.r === 300 &&
    w.zones.length === 1 && w.zones[0].soort === 'eind' && v.p_leider_code === 'leidercode-xyz', JSON.stringify(v));
  t('opslaan in een spel: de koffer hoort het binnen 15 s', (await tekst('#toast')).includes('binnen 15 s'), await tekst('#toast'));
  await page.waitForTimeout(300);
  const dbg = await page.evaluate(() => ({labels: document.querySelectorAll('.zone-label').length}));
  t('opslaan: de grens en de zone staan nu op de kaart', dbg.labels === 1, JSON.stringify(dbg) + ' ' + fouten.join('|'));
  await page.click('#bInstel');
  await page.click('#bOpslaan');
  t('opslaan zonder wijziging = geen verzoek', instelVerzoeken.length === 1, String(instelVerzoeken.length));

  // 4b. 20 min later: de koffer in rust (geen spel), meldde zich 10 min geleden (na de wijziging hierboven)
  leiderNu.spel = ''; leiderNu.fase = null; leiderNu.nu = nu + 1200; leiderNu.gezien = nu + 600;
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('regels').textContent.includes('in rust'));
  t('leider in rust: niet OFFLINE, "in rust, meldt zich elk half uur"', !(await tekst('#pil')).includes('OFFLINE'),
    await tekst('#pil') + ' | ' + await tekst('#regels'));
  await page.click('#bInstel');
  await page.click('.keuze button:has-text("Altijd")');
  await page.click('#bOpslaan');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Opgeslagen'));
  t('opslaan in rust: "hoogstens een half uur, of meteen als er een spel opengaat"',
    (await tekst('#toast')).includes('hoogstens een half uur'), await tekst('#toast'));
  t('de toast past op het scherm', await page.$eval('#toast', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  await page.screenshot({path: path.join(UIT, 'leider_rust.png')});
  await page.waitForFunction(() => document.getElementById('regels').textContent.includes('onderweg'));
  t('net "Altijd" gekozen, koffer hoorde het nog niet: niet OFFLINE maar "nieuwe instelling nog onderweg"',
    !(await tekst('#pil')).includes('OFFLINE'), await tekst('#pil') + ' | ' + await tekst('#regels'));
  // de koffer meldt zich (na de wijziging) en volgt nu: verbonden zonder "in rust"
  leiderNu.nu = nu + 1230; leiderNu.gezien = nu + 1220;
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('regels').textContent.includes('10 s geleden'));
  t('daarna volgt hij: verbonden, zonder "in rust" of "onderweg"', !/in rust|onderweg|OFFLINE/.test(await tekst('#regels') + await tekst('#pil')),
    await tekst('#pil') + ' | ' + await tekst('#regels'));
  // en zwijgt hij daarna terwijl hij zou moeten volgen: na 10 min OFFLINE (de grens is ~3 min)
  leiderNu.nu = nu + 1820;
  await page.evaluate(() => haal());
  await page.waitForFunction(() => document.getElementById('pil').textContent.includes('OFFLINE'));
  t('volgt hij maar zwijgt hij 10 min: OFFLINE', (await tekst('#regels')).includes('niet verbonden'), await tekst('#regels'));

  // 5. Zonder code, 6. een code die niet werkt
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:8765/');
  t('zonder code: uitleg', await p2.$eval('#leeg', e => e.classList.contains('open') && e.textContent.includes('Open de link')));
  await p2.goto('http://localhost:8765/#k=fout-code-99');  // alleen het hekje anders: de pagina laadt zelf opnieuw
  await p2.waitForFunction(() => document.getElementById('leeg').textContent.includes('werkt niet'));
  t('verkeerde code: "deze link werkt niet"', true);

  // 7. Wat er naar buiten gaat
  const refs = [...tegelReferers];
  t('kaarttegels krijgen een referer (OpenStreetMap vraagt dat), alleen het adres van de site, nooit de code',
    refs.length > 0 && refs.every(r => r === 'http://localhost:8765/'), refs.join(', '));
  t('geen verzoeken naar andere servers (geen unpkg)', vreemd.length === 0, vreemd.join(', '));
  t('geen JavaScript-fouten', fouten.length === 0, fouten.join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + goed + ' goed, ' + fout + ' fout  (schermafdrukken in ' + UIT + ')');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
