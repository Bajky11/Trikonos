# Trikonoš — React frontend

Desktopový přepis všech stránek z `../frontend/dist` do **Reactu, TypeScriptu a MUI**.
Používá **Vite+** a **Bun**. Původní HTML frontend zůstává beze změn.

## Spuštění

V adresáři `frontend2`:

```sh
bun install --frozen-lockfile
bun run dev
```

Aplikace běží na **http://localhost:5173**. Úpravy se projeví přes HMR.
Použitá verze Bun je uvedená v `package.json`; Vite+ je lokální závislost,
globální instalace `vp` není potřeba.

### Docker

Z kořene repozitáře lze spustit frontend i backend s hot reloadem:

```sh
docker compose -f docker-compose.dev.yaml up --build
```

Samotný frontend: `docker compose -f docker-compose.dev.yaml up --build frontend`.
Backend není jeho závislost. Vývojový Docker target obsahuje Node.js i Bun;
zdrojové soubory jsou připojené z hostitele, `node_modules` má vlastní volume.

`Dockerfile` má také výchozí target `production`: sestaví aplikaci a do finálního
Nginx image zkopíruje pouze `dist/`. `nginx.conf` zajišťuje SPA fallback,
nepřeposílá žádné požadavky do backendu. Produkční spuštění celého stacku,
konfigurace prostředí a HTTPS jsou popsané v [kořenovém README](../README.md).

```sh
bun run check       # formátování, lint a typová kontrola
bun run test        # jednotkové testy katalogu a geometrie editoru
bun run build      # TypeScript + produkční build do dist/
bun run preview    # náhled produkčního buildu
```

Pro prohlížečové testy:

```sh
bunx playwright install chromium
bun run test:e2e
```

Testy běží v Chromium na desktopu 1440 × 900. Pokrývají navigaci, galerie,
sezóny, FAQ, filtrování a stránkování katalogu, detail produktu a košík,
výběr/nahrávání/úpravy potisku, administrativní vyhledávání a CRUD číselníků.

## Routy

- `/` — úvodní stránka, galerie realizací, sezóny, katalog, editor potisku a FAQ
- `/tricka` — celý katalog (`?kategorie=bitcoin&strana=2` pro filtr a stránku)
- `/produkt/:id` — detail produktu, například `/produkt/trikonos-1260`
- `/admin` — přehled
- `/admin/objednavky`, `/admin/produkty`, `/admin/sezony`, `/admin/klienti`, `/admin/ciselniky`

Původní `.html` URL se nepodporují. Při nasazení statického buildu nastavte
**SPA fallback na `index.html`**, aby fungovalo přímé otevření a obnovení rout.

## Struktura a vzhled

- `src/theme.ts` — společná paleta, typografie, vzhled MUI komponent a CSS tokeny
- `src/styles.css` — sdílená rozložení a specifické scény/editor podle HTML předlohy;
  barvy čerpají z theme přes CSS proměnné, komponenty neopakují vlastní `sx` styly
- `src/components/` — společný shell, produktové karty, galerie, sezóny, košík a editor
- `src/pages/` — veřejné stránky a samostatný, líně načítaný administrační modul
- `src/data/` — typovaná testovací data (8 fotografických + 192 generovaných produktů)
- `public/` — samostatné kopie potřebných obrázků z původního frontendu, včetně
  dokumentace jejich zdrojů

Výchozí obrázek úvodu je `background/varianta1.png`. Přepínač alternativních
pozadí je odstraněný. Fonty DM Sans a Manrope se načítají lokálně z balíčků
Fontsource; aplikace nepotřebuje Google Fonts ani síťové načítání katalogu.

## Záměrná omezení prototypu

- **Žádné napojení na backend**, API, skutečnou autentizaci, platby ani objednávání.
- Košík a číselníky se ukládají jen do `localStorage` v prohlížeči, pod vlastními
  klíči `trikonos-react-demo-cart-v1` a `trikonos-react-dictionaries-v1`.
- Nahrané obrázky zůstávají v prohlížeči; větší soubor může přesáhnout jeho
  úložnou kvótu. Aplikace v takovém případě zobrazí chybu a nepotvrdí uložení.
- Login v patičce pouze otevře demo administraci; údaje neodesílá ani neukládá.
- Statistiky, objednávky a recenze jsou ukázkové. Sekce Produkty a Klienti mají
  stejné zástupné obrazovky jako HTML předloha, Sezóny obsahují informační seznam.
- Vzhled byl laděn pro desktop. Mobilní rozložení není součástí této migrace.
- Je to vizuálně věrný přepis, nikoli garantovaná pixelová shoda každého stavu:
  formuláře, dialogy, tabulky a FAQ používají MUI a drobně se liší od nativního HTML.
