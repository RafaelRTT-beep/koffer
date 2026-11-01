# RAF Challenge case: de kaart

Waar is de koffer? Deze pagina laat het zien op je telefoon, tijdens een spel met de RAF Challenge case.

**Open de link die je van de spelleider kreeg.** Zonder link toont de pagina niets.

| link | voor wie | wat je ziet |
|---|---|---|
| `https://rafaelrtt-beep.github.io/koffer/#k=<code>` | kijkers (spelers, publiek) | wat de spelleider toestaat: live, vertraagd, een vage cirkel waar de koffer ergens in ligt, of niets |
| `https://rafaelrtt-beep.github.io/koffer/#l=<code>` | de spelleider | alles, plus de instellingen |

De spelleider stelt op de kaart zelf in:

- **wanneer** de koffer zijn plek doorgeeft (tijdens een spel, altijd, of nooit) en **hoe vaak** (5-300 s);
- **wat kijkers zien**: live, vertraagd, een vage cirkel (met de straal), of niets; hoe vaak ze een nieuwe plek
  krijgen, en of ze het spoor en de zones zien;
- het **speelgebied** (een cirkel of veelhoek, op de kaart getekend) en wat er gebeurt als de koffer eruit gaat;
- de **zones** voor TRANSPORT (checkpoints en de eindpost) en een snelheidsgrens;
- een **nieuwe kijk-link**: de oude werkt dan niet meer.

## Hoe het werkt

- De koffer (een ESP32 met GPS en 4G) meldt zich over 4G bij een database (Supabase). Een plek geeft hij alleen
  door als de spelleider dat toestaat; standaard alleen terwijl er een spel open staat op de koffer. In rust
  meldt hij zich eens per half uur, zonder plek.
- Deze pagina vraagt de database elke 5 s (spelleider) of 10 s (kijkers) wat je met jouw code mag zien.
- De code staat achter het hekje (`#`). Een browser stuurt dat deel nooit mee in een adres of referer: GitHub en
  de kaartserver krijgen hem niet, alleen de database, in het verzoek zelf.
- De sleutel in `index.html` is de publieke sleutel van het project, bedoeld voor webpagina's. De tabellen zijn
  dicht; wat je ziet hangt alleen aan de code in je link.
- Kaart: © [OpenStreetMap](https://www.openstreetmap.org/copyright)-bijdragers. Leaflet 1.9.4 staat in
  `leaflet/` (BSD-2-licentie, zie `leaflet/LICENSE`), zodat de pagina geen andere server nodig heeft.

De firmware van de koffer en het databaseschema staan in een privé-repo.

## Toetsen

`toets/toets.js` laadt de pagina in Chromium met een nagebootste database en kaart, zonder internet, en loopt
kijkers (live, vaag, verborgen, in rust, offline) en de spelleider (instellingen, tekenen, opslaan) door.

```sh
npm i playwright && npx playwright install chromium
node toets/toets.js
```
