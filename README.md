# DX7 FM-synt

En FM-synt för mobilen som emulerar Yamaha DX7. Den körs som en webbapp (PWA) och kan installeras på hemskärmen på både iPhone och Android, utan app-butik. Efter första besöket fungerar den offline.

## Funktioner

- 6 operatorer och alla 32 DX7-algoritmer, med feedback (även trevägs-looparna i algoritm 4 och 6)
- DX7:s envelopes, nivå- och rate-skalning över klaviaturen, anslagskänslighet, tonhöjdsenvelope och LFO (6 vågformer, fördröjning, vibrato, tremolo)
- 16 polyfona röster, ljudmotorn körs i en AudioWorklet
- Pianoklaviatur för flera fingrar med glissando; anslaget styrs av var på tangenten du trycker
- Pitch bend, modulationshjul, sustain och oktavknappar
- Läser riktiga DX7-banker (32 ljud) och enstaka ljud i `.syx`-format, och exporterar banker till `.syx`
- Redigera alla parametrar, med algoritmdiagram och envelope-grafer, och spara egna ljud
- MIDI-keyboard via Web MIDI (Chrome/Android) och datorns tangentbord (A–K, Z/X byter oktav)

## Installera på telefonen

Appen måste ligga på en HTTPS-adress, till exempel GitHub Pages (Settings → Pages → Deploy from branch → `main`, mappen `/`).

- **iPhone (Safari):** öppna adressen, tryck på Dela-knappen och välj "Lägg till på hemskärmen".
- **Android (Chrome):** öppna adressen och välj "Installera app" i menyn.

## Köra lokalt

Ingen byggprocess behövs, bara en statisk webbserver:

```sh
python3 -m http.server 8000
# öppna http://localhost:8000
```

## Tester

```sh
node test/engine.test.mjs
```

Testerna renderar alla ljud genom motorn och kontrollerar att det inte blir tystnad, NaN eller klippning, att alla 32 algoritmer låter, att A4 är stämd till 440 Hz och att `.syx`-export och import ger tillbaka samma ljud.

## Struktur

| Fil | Innehåll |
| --- | --- |
| `js/dx7-worklet.js` | Ljudmotorn (operatorer, envelopes, LFO, röster) |
| `js/algorithms.js` | De 32 algoritmerna |
| `js/syx.js` | Läsa och skriva DX7 sysex |
| `js/presets.js` | De inbyggda ljuden |
| `js/app.js` | Gränssnittet |
| `js/keyboard.js`, `js/diagram.js`, `js/audio.js` | Klaviatur, algoritmdiagram, Web Audio |

Motorns envelope-, skalnings- och LFO-beteende följer hur DX7 fungerar enligt det öppna MSFA/Dexed-projektets analys. De inbyggda ljuden är egna och inte kopior av Yamahas fabriksljud.
