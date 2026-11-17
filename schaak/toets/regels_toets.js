// Toets van de schaakregels: node schaak/toets/regels_toets.js
// De perft-getallen (aantal stellingen na n zetten) zijn de bekende controlegetallen van chessprogramming.org.
const R = require('../regels.js');
let fout = 0, goed = 0;
function eis(naam, a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) goed++;
  else { fout++; console.log('FOUT', naam, 'kreeg', JSON.stringify(a), 'verwacht', JSON.stringify(b)); }
}
const perft = [
  ['begin', R.START, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['stelling 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['stelling 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['stelling 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [n, fen, getallen] of perft)
  getallen.forEach((g, i) => eis('perft ' + n + ' diepte ' + (i + 1), R.perft(R.vanFen(fen), i + 1), g));

function speelReeks(tekst, fen) {
  let s = R.vanFen(fen || R.START); const tel = {}; const not = [];
  tel[R.sleutel(s)] = 1;
  for (const z of tekst.split(' ').filter(Boolean)) {
    const m = R.zoek(s, z);
    if (!m) throw new Error('zet ' + z + ' mag niet');
    not.push(R.notatie(s, m));
    s = R.speel(s, m);
    tel[R.sleutel(s)] = (tel[R.sleutel(s)] || 0) + 1;
  }
  return {s, tel, not};
}
// herdersmat
let x = speelReeks('e2e4 e7e5 d1h5 b8c6 f1c4 g8f6 h5f7');
eis('herdersmat', R.stand(x.s, x.tel), {klaar: true, uitslag: 'w', reden: 'mat', schaak: true});
eis('notatie herdersmat', x.not, ['e4', 'e5', 'Dh5', 'Pc6', 'Lc4', 'Pf6', 'Dxf7#']);
// gekkenmat: zwart wint
x = speelReeks('f2f3 e7e5 g2g4 d8h4');
eis('gekkenmat', R.stand(x.s, x.tel).uitslag, 'b');
// pat
eis('pat', R.stand(R.vanFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), {klaar: true, uitslag: 'remise', reden: 'pat', schaak: false});
// te weinig materiaal
eis('K tegen K', R.stand(R.vanFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1')).reden, 'te weinig materiaal');
eis('K+P tegen K', R.stand(R.vanFen('8/8/4k3/8/8/3KN3/8/8 w - - 0 1')).reden, 'te weinig materiaal');
eis('K+T tegen K is genoeg', R.stand(R.vanFen('8/8/4k3/8/8/3KR3/8/8 w - - 0 1')).klaar, false);
eis('lopers op dezelfde kleur', R.stand(R.vanFen('8/8/4k1b1/8/8/3KB3/8/8 w - - 0 1')).klaar, false);
// drie keer dezelfde stelling
x = speelReeks('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
eis('herhaling', R.stand(x.s, x.tel).reden, 'drie keer dezelfde stelling');
x = speelReeks('g1f3 g8f6 f3g1 f6g8');
eis('twee keer is nog geen remise', R.stand(x.s, x.tel).klaar, false);
// 50 zetten
eis('50 zetten', R.stand(R.vanFen('8/8/4k3/8/8/3KR3/8/8 w - - 100 80')).uitslag, 'remise');
// rokade, en passant, promotie
x = speelReeks('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 e1g1');
eis('korte rokade', [x.s.b[6], x.s.b[5], x.s.b[4], x.s.b[7], x.not[6]], ['K', 'R', null, null, 'O-O']);
eis('rokaderecht weg', x.s.cs, 'kq');
x = speelReeks('e2e4 a7a6 e4e5 d7d5 e5d6');
eis('en passant', [x.s.b[R.veld('d5')], x.s.b[R.veld('d6')], x.not[4]], [null, 'P', 'exd6']);
x = speelReeks('a7a8n', '8/P6k/8/8/8/8/8/K7 w - - 0 1');
eis('promotie tot paard', [x.s.b[R.veld('a8')], x.not[0]], ['N', 'a8=P']);
eis('rokade door schaak mag niet', R.zoek(R.vanFen('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1'), 'e1g1'), null);
eis('lange rokade mag dan wel', !!R.zoek(R.vanFen('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1'), 'e1c1'), true);
// dubbelzinnige zetten in de notatie
x = speelReeks('a1d1', '7k/8/8/8/8/8/8/R4R1K w - - 0 1');
eis('notatie met lijn', x.not[0], 'Tad1');
// de computer: pakt een dame die gratis is, en geeft mat in 1
let m = R.computerZet(R.vanFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1'), 2, () => 0);
eis('computer slaat de dame', R.uci(m), 'e4d5');
m = R.computerZet(R.vanFen('6k1/5ppp/8/8/8/8/8/R6K w - - 0 1'), 3, () => 0);
eis('computer geeft mat in 1', R.uci(m), 'a1a8');
// een heel potje computer tegen computer: elke zet moet geldig zijn en het moet aflopen of 120 zetten halen
let s = R.begin(), tel = {}, n = 0, zaad = 7;
const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
while (n < 120 && !R.stand(s, tel).klaar) {
  const z = R.computerZet(s, 1 + (n % 2), rnd);
  if (!z || !R.zoek(s, R.uci(z))) { fout++; console.log('FOUT computer deed een ongeldige zet'); break; }
  s = R.speel(s, z); tel[R.sleutel(s)] = (tel[R.sleutel(s)] || 0) + 1; n++;
}
eis('potje computer-computer loopt', n > 10, true);
console.log(fout ? fout + ' FOUT, ' + goed + ' goed' : 'alles goed (' + goed + ')');
process.exit(fout ? 1 : 0);
