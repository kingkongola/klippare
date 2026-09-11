# Klippare

En interaktiv Three.js-simulering av två sätt att klippa samma gräsmatta:

- klassisk slump-/studskörning
- kartlagd, systematisk körning med zonindelning

Sidan förklarar också varför gräsmattans form spelar roll, visar en enkel täckningsmodell och låter användaren köra Monte Carlo-försök.

## Kör lokalt

Det är en statisk sida. Öppna `index.html` via en enkel lokal webbserver, exempelvis:

```bash
python3 -m http.server 8000
```

Gå sedan till `http://localhost:8000`.

## Modell

Detta är ett algoritm- och geometriexperiment, inte ett produkttest. Simulatorn modellerar bland annat:

- kroppsradius och kantdetektion
- backning + slumpmässig undanmanöver för den enkla roboten
- systematiska parallella spår och zonindelning för den kartlagda roboten
- svängtid, transportsträckor och överlapp
- batteriförbrukning, hemkörning och laddning
- faktisk täckning på ett raster
- Monte Carlo-fördelning för slumpstrategin

Three.js laddas från jsDelivr.
