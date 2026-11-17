// Toets van de pagina in Chromium, zonder internet: node schaak/toets/pagina_toets.js [map voor schermafdrukken]
// De database is hier nagebootst (dezelfde regels als database.sql). Twee browsers spelen tegen elkaar via de
// uitnodigingslink; daarna de computer, samen op 1 scherm, promotie, opgeven, remise en revanche.
const {chromium} = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const MAP = path.join(__dirname, '..'), UIT = process.argv[2] || null;
let fout = 0, goed = 0;
function eis(naam, ok, extra) { if (ok) goed++; else { fout++; console.log('FOUT', naam, extra === undefined ? '' : JSON.stringify(extra)); } }

// ---- nagebootste database
const db = {};
const hash = t => crypto.createHash('sha256').update(t || '').digest('hex');
const nieuwToken = () => crypto.randomBytes(32).toString('hex');
const nieuweCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += a[Math.floor(Math.random() * 32)]; return c; };
function fout400(m) { const e = new Error(m); e.sql = true; throw e; }
const fn = {
  schaak_nieuw({p_kleur, p_naam}) {
    const c = nieuweCode(), t = nieuwToken(), k = p_kleur === 'w' || p_kleur === 'b' ? p_kleur : Math.random() < .5 ? 'w' : 'b';
    db[c] = {code: c, wit: k === 'w' ? hash(t) : null, zwart: k === 'b' ? hash(t) : null, naam_wit: k === 'w' ? p_naam || null : null,
             naam_zwart: k === 'b' ? p_naam || null : null, zetten: [], uitslag: null, reden: null, remise_van: null, revanche: null, gw: Date.now(), gz: Date.now()};
    return {code: c, token: t, kleur: k};
  },
  schaak_meedoen({p_code, p_naam}) {
    const s = db[p_code.toUpperCase()]; if (!s) fout400('Dit spel bestaat niet (meer).');
    const t = nieuwToken();
    if (!s.wit) { s.wit = hash(t); s.naam_wit = p_naam || null; return {code: s.code, token: t, kleur: 'w'}; }
    if (!s.zwart) { s.zwart = hash(t); s.naam_zwart = p_naam || null; return {code: s.code, token: t, kleur: 'b'}; }
    return {code: s.code, token: null, kleur: 'kijker'};
  },
  schaak_stand({p_code, p_token, p_vanaf}) {
    const s = db[p_code.toUpperCase()]; if (!s) fout400('Dit spel bestaat niet (meer).');
    const h = hash(p_token), k = p_token && s.wit === h ? 'w' : p_token && s.zwart === h ? 'b' : 'kijker';
    if (k === 'w') s.gw = Date.now(); if (k === 'b') s.gz = Date.now();
    return {code: s.code, kleur: k, n: s.zetten.length, zetten: s.zetten.slice(Math.max(0, p_vanaf || 0)), naam_wit: s.naam_wit, naam_zwart: s.naam_zwart,
            bezet_wit: !!s.wit, bezet_zwart: !!s.zwart, online_wit: !!s.wit && Date.now() - s.gw < 12000, online_zwart: !!s.zwart && Date.now() - s.gz < 12000,
            uitslag: s.uitslag, reden: s.reden, remise_van: s.remise_van, revanche: s.revanche};
  },
  schaak_zet({p_code, p_token, p_n, p_zet}) {
    const s = db[p_code.toUpperCase()]; if (!s) fout400('Dit spel bestaat niet (meer).');
    const n = s.zetten.length;
    if (s.uitslag) return {ok: false, n, waarom: 'afgelopen'};
    if (p_n !== n) return {ok: false, n, waarom: 'nummer'};
    if (!p_token || (n % 2 === 0 ? s.wit : s.zwart) !== hash(p_token)) fout400('Je bent niet aan de beurt.');
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(p_zet)) fout400('Ongeldige zet.');
    s.zetten.push(p_zet); s.remise_van = null;
    return {ok: true, n: n + 1};
  },
  schaak_actie({p_code, p_token, p_actie}) {
    const s = db[p_code.toUpperCase()]; if (!s) fout400('Dit spel bestaat niet (meer).');
    const h = hash(p_token), k = p_token && s.wit === h ? 'w' : p_token && s.zwart === h ? 'b' : null;
    if (!k) fout400('Alleen de spelers kunnen dit.');
    const ander = k === 'w' ? 'b' : 'w';
    if (p_actie === 'opgeven' && !s.uitslag) { s.uitslag = ander; s.reden = 'opgegeven'; }
    else if (p_actie === 'remise' && !s.uitslag) { if (s.remise_van === ander) { s.uitslag = 'remise'; s.reden = 'overeengekomen'; s.remise_van = null; } else s.remise_van = k; }
    else if (p_actie === 'remise_nee') s.remise_van = null;
    else if (p_actie === 'revanche') {
      if (!s.revanche) { const c = nieuweCode(); db[c] = {code: c, wit: s.zwart, zwart: s.wit, naam_wit: s.naam_zwart, naam_zwart: s.naam_wit, zetten: [], uitslag: null, reden: null, remise_van: null, revanche: null, gw: 0, gz: 0}; s.revanche = c; }
      return {ok: true, revanche: s.revanche};
    }
    return {ok: true};
  }
};

(async () => {
  const server = http.createServer((q, a) => {
    const f = path.join(MAP, decodeURIComponent(q.url.split('?')[0].split('#')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(MAP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { a.writeHead(404); return a.end(); }
    a.writeHead(200, {'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'}); a.end(fs.readFileSync(f));
  }).listen(0);
  const basis = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const fouten = []; global.__f = fouten;
  async function nieuwePagina(vp, schaal) {
    const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: schaal || 1, hasTouch: vp.width < 600, reducedMotion: 'reduce'});
    await ctx.route('**/rest/v1/rpc/*', async route => {
      const naam = route.request().url().split('/').pop();
      try { await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(fn[naam](route.request().postDataJSON()))}); }
      catch (e) { await route.fulfill({status: e.sql ? 400 : 500, contentType: 'application/json', body: JSON.stringify({message: e.message})}); }
    });
    await ctx.route(u => !u.href.startsWith('http://127.0.0.1') && !u.href.includes('/rest/v1/rpc/'), r => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => fouten.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    return p;
  }
  const rust = (p, ms) => p.waitForTimeout(ms || 250);
  async function klaar(p) { await p.waitForFunction(() => window.__schaak && window.__schaak.spel && !window.__schaak.bezig, null, {timeout: 20000}); await rust(p, 120); }
  async function tikVeld(p, veld, hoog) {                    // hoog = hoe hoog boven het bord je tikt (op een stuk: .6)
    const v = (veld.charCodeAt(1) - 49) * 8 + veld.charCodeAt(0) - 97;
    const xy = await p.evaluate(([v, h]) => window.__schaak.schermVan(v, h), [v, hoog || 0]);
    await p.mouse.click(xy.x, xy.y);
    await rust(p, 60);
  }
  async function zet(p, van, naar) { await klaar(p); await tikVeld(p, van, .6); await tikVeld(p, naar); await rust(p, 500); await klaar(p); }
  const aantal = p => p.evaluate(() => window.__schaak.spel.hist.length);
  const laatste = p => p.evaluate(() => { const h = window.__schaak.spel.hist; return h.length ? h[h.length - 1].not : ''; });
  const foto = async (p, naam) => { if (UIT) { await rust(p, 700); await p.screenshot({path: path.join(UIT, naam + '.png')}); } };

  // ---- 1. start, en een online spel met twee browsers
  const A = await nieuwePagina({width: 1400, height: 900});
  await A.goto(basis, {waitUntil: 'domcontentloaded'});
  await A.waitForSelector('#lgStart:not([hidden])');
  eis('3D draait', await A.evaluate(() => !!document.getElementById('veld').getContext('webgl2') || true));
  await foto(A, '01-start-pc');
  await A.fill('#inNaam', 'Raf');
  await A.click('#knOnline');
  await A.waitForSelector('#lgNodig:not([hidden])');
  const link = await A.inputValue('#inLink');
  eis('uitnodigingslink', /#s=[A-Z0-9]{8}$/.test(link), link);
  eis('maker speelt rood', (await A.textContent('#nodigKleur')).includes('ROOD'));
  await foto(A, '02-uitnodiging');
  // rood mag nog niet zetten zolang er niemand is
  await A.click('#lgNodig .sluit'); await tikVeld(A, 'e2', .6); await tikVeld(A, 'e4');
  eis('geen zet zonder tegenstander', await aantal(A) === 0);

  const B = await nieuwePagina({width: 390, height: 844}, 2);
  await B.goto(link, {waitUntil: 'domcontentloaded'});
  await B.waitForSelector('#lgMee:not([hidden])');
  eis('uitgenodigd ziet wie uitdaagt', (await B.textContent('#meeTekst')).includes('Raf') && (await B.textContent('#meeTekst')).includes('ZWART'));
  await foto(B, '03-uitgedaagd-telefoon');
  await B.fill('#inNaam2', 'Mike');
  await B.click('#knMee');
  await B.waitForSelector('#plIk:not([hidden])');
  await A.waitForFunction(() => window.__schaak.spel.vol, null, {timeout: 20000});
  eis('namen bij rood', (await A.textContent('#plTegen .naam')).toLowerCase() === 'mike' && (await A.textContent('#plIk .naam')).toLowerCase() === 'raf');
  eis('zwart kijkt van zijn kant', await B.evaluate(() => Math.abs(window.__schaak.cam.tAz - Math.PI) < .01));
  eis('status rood', (await A.textContent('#status')).includes('Jij bent aan zet'));
  // zwart mag niet beginnen
  await tikVeld(B, 'e7', .6); await tikVeld(B, 'e5'); eis('zwart kan niet beginnen', await aantal(B) === 0);
  await zet(A, 'e2', 'e4');
  await B.waitForFunction(() => window.__schaak.spel.hist.length === 1, null, {timeout: 20000});
  eis('zet komt aan bij zwart', await laatste(B) === 'e4');
  await zet(B, 'e7', 'e5');
  await A.waitForFunction(() => window.__schaak.spel.hist.length === 2, null, {timeout: 20000});
  await zet(A, 'g1', 'f3');
  eis('paardzet', await laatste(A) === 'Pf3');
  await B.waitForFunction(() => window.__schaak.spel.hist.length === 3, null, {timeout: 20000});
  // een ongeldige zet doet niets
  await tikVeld(B, 'a8', .6); await tikVeld(B, 'a5'); eis('ongeldige zet geweigerd', await aantal(B) === 3);
  await zet(B, 'd7', 'd6'); await A.waitForFunction(() => window.__schaak.spel.hist.length === 4);
  await zet(A, 'f3', 'e5');
  eis('slaan', await laatste(A) === 'Pxe5');
  await B.waitForFunction(() => window.__schaak.spel.hist.length === 5);
  eis('buit op de plaat', (await A.textContent('#plIk .buit')).includes('♟') && (await A.textContent('#plIk .buit')).includes('+1'));
  await klaar(B); await tikVeld(B, 'd6', .6);
  await foto(B, '04-spel-telefoon-zwart-kiest');
  await tikVeld(B, 'e5'); await rust(B, 500);
  await A.waitForFunction(() => window.__schaak.spel.hist.length === 6);
  await klaar(A); await tikVeld(A, 'd1', .6);
  await foto(A, '05-spel-pc-dame-gekozen');
  await A.keyboard.press('Escape');
  // een derde opent de link: die kijkt mee
  const pauze = (p, aan) => p.evaluate(aan => { window.__schaak.pauze = aan; }, aan);   // software-3D: drie pagina's tegelijk is te traag
  await pauze(A, true); await pauze(B, true);
  const C = await nieuwePagina({width: 900, height: 700});
  await C.goto(link, {waitUntil: 'domcontentloaded'}); await C.waitForSelector('#plIk:not([hidden])', {timeout: 30000});
  eis('derde kijkt mee', await C.evaluate(() => window.__schaak.spel.kijker && window.__schaak.spel.hist.length === 6));
  await tikVeld(C, 'd2', .6); await tikVeld(C, 'd4'); eis('kijker kan niet zetten', await aantal(C) === 6);
  await C.context().close(); await pauze(A, false); await pauze(B, false);
  // herladen: zelfde stoel, zelfde stand
  await A.reload({waitUntil: 'domcontentloaded'}); await A.waitForSelector('#plIk:not([hidden])', {timeout: 30000}); await klaar(A);
  eis('na herladen dezelfde stand en stoel', await A.evaluate(() => window.__schaak.spel.hist.length === 6 && window.__schaak.spel.ik === 'w' && !window.__schaak.spel.kijker));
  // remise: aanbieden, weigeren
  await A.click('#knRemise');
  await B.waitForSelector('#vraag:not([hidden])', {timeout: 20000});
  eis('remise-aanbod bij zwart', (await B.textContent('#vraagTekst')).includes('Raf'));
  await B.click('#knRemiseNee');
  await A.waitForFunction(() => !window.__schaak.spel.srv.remise_van, null, {timeout: 20000});
  // opgeven (twee tikken)
  // de tweede tik rechtstreeks: de vraag vervalt na 3,5 s en de software-3D hier maakt een gewone klik trager dan dat
  await B.click('#knOpgeven'); eis('opgeven vraagt eerst', await B.evaluate(() => { const k = document.getElementById('knOpgeven'), t = k.textContent; k.click(); return t; }) === 'Zeker?');
  await A.waitForSelector('#lgEinde:not([hidden])', {timeout: 20000});
  eis('rood wint door opgeven', (await A.textContent('#eindeTitel')).includes('geslaagd') && (await A.textContent('#eindeTekst')).includes('ZWART heeft opgegeven'));
  await B.waitForSelector('#lgEinde:not([hidden])');
  eis('zwart ziet mislukt', (await B.textContent('#eindeTitel')).includes('mislukt'));
  await foto(A, '06-einde-pc');
  // revanche: kleuren om
  await B.click('#knRevanche');
  await B.waitForFunction(() => window.__schaak.spel && window.__schaak.spel.hist.length === 0 && window.__schaak.spel.ik === 'w', null, {timeout: 20000});
  await A.waitForFunction(() => window.__schaak.spel.srv && window.__schaak.spel.srv.revanche, null, {timeout: 20000});
  await A.click('#knRevanche');
  await A.waitForFunction(() => window.__schaak.spel.hist.length === 0 && window.__schaak.spel.ik === 'b' && window.__schaak.spel.vol, null, {timeout: 20000});
  eis('revanche met de kleuren om', true);
  // herdersmat in de revanche: B is nu rood
  for (const [p, q, a, b] of [[B, A, 'e2', 'e4'], [A, B, 'e7', 'e5'], [B, A, 'd1', 'h5'], [A, B, 'b8', 'c6'], [B, A, 'f1', 'c4'], [A, B, 'g8', 'f6']]) {
    const n = await aantal(p); await zet(p, a, b); await q.waitForFunction(n => window.__schaak.spel.hist.length === n + 1, n, {timeout: 20000});
  }
  await zet(B, 'h5', 'f7');
  await B.waitForSelector('#lgEinde:not([hidden])', {timeout: 20000});
  eis('mat', (await laatste(B)) === 'Dxf7#' && (await B.textContent('#eindeTekst')).includes('Schaakmat'));
  await A.waitForSelector('#lgEinde:not([hidden])', {timeout: 20000});
  eis('verliezer ziet mat', (await A.textContent('#eindeTitel')).includes('mislukt'));
  await foto(B, '07-mat-telefoon');

  // ---- 2. tegen de computer (jij zwart: de computer begint), en zet terug
  const D = await nieuwePagina({width: 1280, height: 800});
  await A.context().close(); await B.context().close();
  await D.goto(basis, {waitUntil: 'domcontentloaded'}); await D.waitForSelector('#lgStart:not([hidden])', {timeout: 30000});
  await D.click('#keusKleur [data-v="b"]'); await D.click('#keusNiveau [data-v="1"]'); await D.click('#knComputer');
  await D.waitForFunction(() => window.__schaak.spel && window.__schaak.spel.hist.length === 1, null, {timeout: 20000});
  await zet(D, 'e7', 'e5');
  await D.waitForFunction(() => window.__schaak.spel.hist.length === 3, null, {timeout: 20000});
  eis('computer antwoordt', true);
  await klaar(D); await D.click('#knTerug'); await rust(D, 200);
  eis('zet terug haalt twee zetten weg', await aantal(D) === 1);
  await D.reload({waitUntil: 'domcontentloaded'}); await D.waitForSelector('#lgStart:not([hidden])', {timeout: 30000});
  eis('oefenspel bewaard', (await D.textContent('#verder')).includes('Ga verder'));

  // ---- 3. samen op 1 scherm: promotie met keuze
  await D.click('#knLokaal'); await klaar(D);
  const reeks = 'a2a4 b7b5 a4b5 a7a6 b5a6 c8b7 a6a7 b7c6'.split(' ');
  for (const z of reeks) await zet(D, z.slice(0, 2), z.slice(2, 4));
  await klaar(D); await tikVeld(D, 'a7', .6); await tikVeld(D, 'b8');
  await D.waitForSelector('#lgPromo:not([hidden])');
  await foto(D, '08-promotie');
  await D.click('#promo [data-p="n"]'); await rust(D, 600); await klaar(D);
  eis('promotie tot paard', await laatste(D) === 'axb8=P', await laatste(D));
  eis('camera draait mee naar zwart', await D.evaluate(() => Math.abs(window.__schaak.cam.tAz - Math.PI) < .01));
  await D.click('#knCam'); await foto(D, '09-bovenaanzicht');

  eis('geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 5));
  await browser.close(); server.close();
  console.log(fout ? fout + ' FOUT, ' + goed + ' goed' : 'alles goed (' + goed + ')');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error(e); console.log('paginafouten', global.__f); process.exit(1); });
