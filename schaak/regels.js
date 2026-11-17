// RTT SCHAAK: de regels. Geen DOM, geen netwerk: dit bestand draait ook in node (toets/regels_toets.js).
// Bord: 64 vakjes, index = rij * 8 + lijn, rij 0 = rij 1 (de kant van wit). Stukken als letters:
// hoofdletter = wit (op het scherm ROOD), kleine letter = zwart. P N B R Q K.
(function (root) {
  'use strict';
  var START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var PAARD = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var KONING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  var RECHT = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var SCHUIN = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function veld(naam) { return (naam.charCodeAt(1) - 49) * 8 + (naam.charCodeAt(0) - 97); }
  function naam(i) { return String.fromCharCode(97 + (i & 7)) + String.fromCharCode(49 + (i >> 3)); }
  function kleur(p) { return p ? (p < 'a' ? 'w' : 'b') : null; }

  function vanFen(fen) {
    var d = fen.split(' '), b = new Array(64).fill(null), rijen = d[0].split('/');
    for (var r = 0; r < 8; r++) {
      var c = 0;
      for (var k = 0; k < rijen[r].length; k++) {
        var ch = rijen[r][k];
        if (ch >= '1' && ch <= '8') c += +ch; else { b[(7 - r) * 8 + c] = ch; c++; }
      }
    }
    return {b: b, turn: d[1] || 'w', cs: !d[2] || d[2] === '-' ? '' : d[2], ep: !d[3] || d[3] === '-' ? -1 : veld(d[3]),
            half: +d[4] || 0, full: +d[5] || 1};
  }
  function begin() { return vanFen(START); }

  // Wordt vakje sq aangevallen door kleur 'door'?
  function aangevallen(b, sq, door) {
    var f = sq & 7, r = sq >> 3, i, j, x, y, p, w = door === 'w';
    var pr = r + (w ? -1 : 1);                     // een pion van 'door' staat een rij 'achter' het vakje
    if (pr >= 0 && pr < 8) {
      if (f > 0 && b[pr * 8 + f - 1] === (w ? 'P' : 'p')) return true;
      if (f < 7 && b[pr * 8 + f + 1] === (w ? 'P' : 'p')) return true;
    }
    for (i = 0; i < 8; i++) {
      x = f + PAARD[i][0]; y = r + PAARD[i][1];
      if (x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === (w ? 'N' : 'n')) return true;
      x = f + KONING[i][0]; y = r + KONING[i][1];
      if (x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === (w ? 'K' : 'k')) return true;
    }
    for (j = 0; j < 2; j++) {
      var richt = j ? SCHUIN : RECHT, a = w ? (j ? 'B' : 'R') : (j ? 'b' : 'r'), q = w ? 'Q' : 'q';
      for (i = 0; i < 4; i++) {
        x = f + richt[i][0]; y = r + richt[i][1];
        while (x >= 0 && x < 8 && y >= 0 && y < 8) {
          p = b[y * 8 + x];
          if (p) { if (p === a || p === q) return true; break; }
          x += richt[i][0]; y += richt[i][1];
        }
      }
    }
    return false;
  }
  function koningVan(b, k) { return b.indexOf(k === 'w' ? 'K' : 'k'); }
  function schaak(s) { return aangevallen(s.b, koningVan(s.b, s.turn), s.turn === 'w' ? 'b' : 'w'); }

  function pseudo(s, alleenSlag) {
    var b = s.b, uit = [], w = s.turn === 'w', i, k, x, y, t, p;
    function voeg(van, naar, extra) {
      var m = {van: van, naar: naar, stuk: b[van], slag: b[naar] || null};
      if (extra) for (var e in extra) m[e] = extra[e];
      uit.push(m);
    }
    for (var sq = 0; sq < 64; sq++) {
      p = b[sq];
      if (!p || (p < 'a') !== w) continue;
      var f = sq & 7, r = sq >> 3, soort = p.toUpperCase();
      if (soort === 'P') {
        var dr = w ? 1 : -1, nr = r + dr, laatste = nr === (w ? 7 : 0);
        if (nr < 0 || nr > 7) continue;
        if (!b[nr * 8 + f] && !alleenSlag) {
          if (laatste) for (k = 0; k < 4; k++) voeg(sq, nr * 8 + f, {promo: 'qrbn'[k]});
          else {
            voeg(sq, nr * 8 + f);
            if (r === (w ? 1 : 6) && !b[(nr + dr) * 8 + f]) voeg(sq, (nr + dr) * 8 + f, {dubbel: true});
          }
        } else if (!b[nr * 8 + f] && laatste) voeg(sq, nr * 8 + f, {promo: 'q'});
        for (k = -1; k <= 1; k += 2) {
          x = f + k;
          if (x < 0 || x > 7) continue;
          t = nr * 8 + x;
          if (b[t] && (b[t] < 'a') !== w) {
            if (laatste) for (i = 0; i < 4; i++) voeg(sq, t, {promo: 'qrbn'[i]}); else voeg(sq, t);
          } else if (t === s.ep && !b[t]) {
            uit.push({van: sq, naar: t, stuk: p, slag: w ? 'p' : 'P', ep: true});
          }
        }
      } else if (soort === 'N' || soort === 'K') {
        var stap = soort === 'N' ? PAARD : KONING;
        for (i = 0; i < 8; i++) {
          x = f + stap[i][0]; y = r + stap[i][1];
          if (x < 0 || x > 7 || y < 0 || y > 7) continue;
          t = y * 8 + x;
          if (b[t] ? (b[t] < 'a') !== w : !alleenSlag) voeg(sq, t);
        }
        if (soort === 'K' && !alleenSlag && sq === (w ? 4 : 60)) {
          var vij = w ? 'b' : 'w', K = w ? 'K' : 'k', Q = w ? 'Q' : 'q', toren = w ? 'R' : 'r';
          if (s.cs.indexOf(K) >= 0 && b[sq + 3] === toren && !b[sq + 1] && !b[sq + 2] &&
              !aangevallen(b, sq, vij) && !aangevallen(b, sq + 1, vij) && !aangevallen(b, sq + 2, vij))
            voeg(sq, sq + 2, {rok: 'K'});
          if (s.cs.indexOf(Q) >= 0 && b[sq - 4] === toren && !b[sq - 1] && !b[sq - 2] && !b[sq - 3] &&
              !aangevallen(b, sq, vij) && !aangevallen(b, sq - 1, vij) && !aangevallen(b, sq - 2, vij))
            voeg(sq, sq - 2, {rok: 'Q'});
        }
      } else {
        var richt = soort === 'R' ? RECHT : soort === 'B' ? SCHUIN : KONING;
        for (i = 0; i < richt.length; i++) {
          x = f + richt[i][0]; y = r + richt[i][1];
          while (x >= 0 && x < 8 && y >= 0 && y < 8) {
            t = y * 8 + x;
            if (b[t]) { if ((b[t] < 'a') !== w) voeg(sq, t); break; }
            if (!alleenSlag) voeg(sq, t);
            x += richt[i][0]; y += richt[i][1];
          }
        }
      }
    }
    return uit;
  }

  function speel(s, m) {
    var b = s.b.slice(), w = s.turn === 'w', p = b[m.van], cs = s.cs;
    b[m.van] = null;
    if (m.ep) b[m.naar + (w ? -8 : 8)] = null;
    b[m.naar] = m.promo ? (w ? m.promo.toUpperCase() : m.promo) : p;
    if (m.rok === 'K') { b[m.naar - 1] = b[m.naar + 1]; b[m.naar + 1] = null; }
    if (m.rok === 'Q') { b[m.naar + 1] = b[m.naar - 2]; b[m.naar - 2] = null; }
    if (cs) {
      if (p === 'K') cs = cs.replace('K', '').replace('Q', '');
      if (p === 'k') cs = cs.replace('k', '').replace('q', '');
      if (m.van === 0 || m.naar === 0) cs = cs.replace('Q', '');
      if (m.van === 7 || m.naar === 7) cs = cs.replace('K', '');
      if (m.van === 56 || m.naar === 56) cs = cs.replace('q', '');
      if (m.van === 63 || m.naar === 63) cs = cs.replace('k', '');
    }
    return {b: b, turn: w ? 'b' : 'w', cs: cs, ep: m.dubbel ? (m.van + m.naar) >> 1 : -1,
            half: (p === 'P' || p === 'p' || m.slag) ? 0 : s.half + 1, full: s.full + (w ? 0 : 1)};
  }

  function zetten(s, alleenSlag) {
    var ps = pseudo(s, alleenSlag), uit = [], vij = s.turn === 'w' ? 'b' : 'w';
    for (var i = 0; i < ps.length; i++) {
      var n = speel(s, ps[i]);
      if (!aangevallen(n.b, koningVan(n.b, s.turn), vij)) uit.push(ps[i]);
    }
    return uit;
  }

  // Sleutel voor 'drie keer dezelfde stelling': stukken, wie aan zet is, rokaderechten, en passant alleen als het kan.
  function sleutel(s) {
    var t = '', i, ep = '-';
    for (i = 0; i < 64; i++) t += s.b[i] || '.';
    if (s.ep >= 0) {
      var pion = s.turn === 'w' ? 'P' : 'p', rij = s.ep + (s.turn === 'w' ? -8 : 8), f = s.ep & 7;
      if ((f > 0 && s.b[rij - 1] === pion) || (f < 7 && s.b[rij + 1] === pion)) ep = s.ep;
    }
    return t + s.turn + s.cs + ep;
  }

  function teWeinig(b) {
    var licht = [], i;
    for (i = 0; i < 64; i++) {
      var p = b[i];
      if (!p || p === 'K' || p === 'k') continue;
      var u = p.toUpperCase();
      if (u === 'P' || u === 'R' || u === 'Q') return false;
      licht.push({u: u, veld: ((i & 7) + (i >> 3)) & 1});
    }
    if (licht.length <= 1) return true;
    for (i = 0; i < licht.length; i++) if (licht[i].u !== 'B' || licht[i].veld !== licht[0].veld) return false;
    return true;                                   // alleen lopers, allemaal op dezelfde kleur velden
  }

  // Hoe staat het spel? telling = {sleutel: aantal keer voorgekomen} (mag ontbreken).
  // Antwoord: {klaar, uitslag: 'w' | 'b' | 'remise' | null, reden, schaak}
  function stand(s, telling) {
    var ms = zetten(s), sch = schaak(s);
    if (!ms.length) return sch ? {klaar: true, uitslag: s.turn === 'w' ? 'b' : 'w', reden: 'mat', schaak: true}
                               : {klaar: true, uitslag: 'remise', reden: 'pat', schaak: false};
    if (teWeinig(s.b)) return {klaar: true, uitslag: 'remise', reden: 'te weinig materiaal', schaak: sch};
    if (s.half >= 100) return {klaar: true, uitslag: 'remise', reden: '50 zetten zonder slag of pionzet', schaak: sch};
    if (telling && telling[sleutel(s)] >= 3) return {klaar: true, uitslag: 'remise', reden: 'drie keer dezelfde stelling', schaak: sch};
    return {klaar: false, uitslag: null, reden: '', schaak: sch};
  }

  // Zet als tekst over de lijn: e2e4, e7e8q
  function uci(m) { return naam(m.van) + naam(m.naar) + (m.promo || ''); }
  function zoek(s, tekst) {
    var ms = zetten(s);
    for (var i = 0; i < ms.length; i++) if (uci(ms[i]) === tekst) return ms[i];
    return null;
  }

  // Nederlandse notatie: K D T L P (koning, dame, toren, loper, paard).
  var NL = {K: 'K', Q: 'D', R: 'T', B: 'L', N: 'P'};
  function notatie(s, m) {
    var t, soort = m.stuk.toUpperCase();
    if (m.rok) t = m.rok === 'K' ? 'O-O' : 'O-O-O';
    else if (soort === 'P') {
      t = (m.slag ? naam(m.van)[0] + 'x' : '') + naam(m.naar) + (m.promo ? '=' + NL[m.promo.toUpperCase()] : '');
    } else {
      var ander = zetten(s).filter(function (o) { return o.stuk === m.stuk && o.naar === m.naar && o.van !== m.van; });
      var extra = '';
      if (ander.length) {
        var lijn = ander.some(function (o) { return (o.van & 7) === (m.van & 7); });
        var rij = ander.some(function (o) { return (o.van >> 3) === (m.van >> 3); });
        extra = !lijn ? naam(m.van)[0] : !rij ? naam(m.van)[1] : naam(m.van);
      }
      t = NL[soort] + extra + (m.slag ? 'x' : '') + naam(m.naar);
    }
    var n = speel(s, m), st = stand(n);
    return t + (st.reden === 'mat' ? '#' : st.schaak ? '+' : '');
  }

  // ------------------------------------------------------------------ de computer (oefenen)
  var WAARDE = {P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0};
  var MIDDEN = [0, 1, 2, 3, 3, 2, 1, 0];
  function weeg(s) {                               // vanuit wie aan zet is
    var t = 0, b = s.b;
    for (var i = 0; i < 64; i++) {
      var p = b[i];
      if (!p) continue;
      var u = p.toUpperCase(), w = p < 'a', f = i & 7, r = i >> 3, v = WAARDE[u];
      var c = MIDDEN[f] + MIDDEN[r];
      if (u === 'P') v += (w ? r - 1 : 6 - r) * 6 + (f > 1 && f < 6 ? c * 3 : 0);
      else if (u === 'N' || u === 'B') v += c * 6 - ((w ? r === 0 : r === 7) ? 12 : 0);
      else if (u === 'Q') v += c * 2;
      else if (u === 'K') v += (w ? r === 0 : r === 7) ? (f < 3 || f > 5 ? 25 : 0) : -20;
      t += w ? v : -v;
    }
    return s.turn === 'w' ? t : -t;
  }
  function orden(ms) {
    return ms.sort(function (a, b) {
      return (b.slag ? WAARDE[b.slag.toUpperCase()] * 10 - WAARDE[b.stuk.toUpperCase()] + 10000 : 0) + (b.promo ? 9000 : 0) -
             (a.slag ? WAARDE[a.slag.toUpperCase()] * 10 - WAARDE[a.stuk.toUpperCase()] + 10000 : 0) - (a.promo ? 9000 : 0);
    });
  }
  function rust(s, a, bta, d) {
    var st = weeg(s);
    if (st >= bta) return bta;
    if (st > a) a = st;
    if (d <= 0) return a;
    var ms = orden(zetten(s, true));
    for (var i = 0; i < ms.length; i++) {
      var v = -rust(speel(s, ms[i]), -bta, -a, d - 1);
      if (v >= bta) return bta;
      if (v > a) a = v;
    }
    return a;
  }
  function zoekDiep(s, d, a, bta, ply) {
    var ms = zetten(s);
    if (!ms.length) return schaak(s) ? -100000 + ply : 0;
    if (s.half >= 100) return 0;
    if (d <= 0) return rust(s, a, bta, 4);
    orden(ms);
    for (var i = 0; i < ms.length; i++) {
      var v = -zoekDiep(speel(s, ms[i]), d - 1, -bta, -a, ply + 1);
      if (v >= bta) return bta;
      if (v > a) a = v;
    }
    return a;
  }
  // niveau 1 (makkelijk) .. 3 (moeilijk). rnd = functie die 0..1 geeft (voor de toets vast te zetten).
  function computerZet(s, niveau, rnd) {
    rnd = rnd || Math.random;
    var ms = orden(zetten(s)), beste = [], top = -1e9, diep = niveau >= 3 ? 3 : niveau === 2 ? 2 : 1;
    if (!ms.length) return null;
    var marge = niveau >= 3 ? 8 : niveau === 2 ? 25 : 90;
    var scores = [];
    for (var i = 0; i < ms.length; i++) {
      var v = -zoekDiep(speel(s, ms[i]), diep - 1, -1e9, 1e9, 1);
      scores.push(v);
      if (v > top) top = v;
    }
    for (i = 0; i < ms.length; i++) if (scores[i] >= top - marge) beste.push(ms[i]);
    return beste[Math.floor(rnd() * beste.length) % beste.length];
  }

  function perft(s, d) {
    if (d === 0) return 1;
    var ms = zetten(s), n = 0;
    if (d === 1) return ms.length;
    for (var i = 0; i < ms.length; i++) n += perft(speel(s, ms[i]), d - 1);
    return n;
  }

  var R = {START: START, vanFen: vanFen, begin: begin, veld: veld, naam: naam, kleur: kleur, zetten: zetten, speel: speel,
           schaak: schaak, stand: stand, sleutel: sleutel, uci: uci, zoek: zoek, notatie: notatie, computerZet: computerZet,
           perft: perft, aangevallen: aangevallen, koningVan: koningVan, WAARDE: WAARDE};
  if (typeof module !== 'undefined' && module.exports) module.exports = R; else root.Regels = R;
})(typeof self !== 'undefined' ? self : this);
