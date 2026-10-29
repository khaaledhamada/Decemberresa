# Decemberresa – Sri Lanka

En illustrerad, interaktiv karta över den preliminära Sri Lanka-rutten och andra möjliga upplevelser.

Kartan finns i `index.html`. Den är fristående och behöver inga externa skript, karttjänster eller inloggningar. Öppna den lokalt i en webbläsare eller via GitHub Pages.

Kartan öppnas i **Vår rutt**: flygplatsen → Sigiriya → Adam’s Peak → Ella → Yala → flygplatsen. Gröna etiketter med nummer visar resplanens stopp. Resordningen ovanpå kartan kan svepas i sidled och varje stopp kan väljas direkt.

Välj **Rutt + tillval** för andra utflyktsmål. De ljusa, streckade etiketterna med plus och texten ”Tillval · inte i rutten” är inte en del av resplanen. Kategorifiltret gäller endast tillval. Målade figurer ligger kvar i bakgrunden även när deras markeringar är dolda.

Tryck på en figur, ett platsnamn eller en resväg för information. Zooma med knapparna, mushjulet eller två fingrar på mobilen. Bilsträckorna visar stoppnummer, ungefärligt avstånd och körtid.

Resvägarna är schematiska. Avstånd och körtider är ungefärliga och tar inte hänsyn till framtida trafik eller pauser. Visade aktiviteter och transportförslag är inte bokningsbekräftelser.

Publicering: GitHub Pages från grenen `main`, katalogen `/ (root)`.

## Uppdatera kartan

Redigera källfilerna i `src/` och bygg sedan den fristående kartfilen med Node.js från projektets rot:

```sh
node src/bundle.mjs index.html
```

Inga npm-paket behövs. Illustrationens bakgrund finns i `src/assets/atlas.png`.
