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

## API: TanStack Query a Orval

Browser volá přímo `http://localhost:8000`, bez proxy. Spusť backend s databází:

```sh
docker compose -f docker-compose.dev.yaml up -d --build backend
```

Příkaz spouštěj z kořene repozitáře. Pro lokální session/CSRF používej frontend
i backend přes `localhost`; `127.0.0.1` je jiný cookie host. Dev backend povoluje
CORS z `http://localhost:5173` i `http://127.0.0.1:5173`.

Výchozí API origin můžeš změnit pomocí `VITE_API_BASE_URL` v `frontend2/.env.local`
(viz `.env.example`). Hodnota je origin **bez `/api/v1`**. Po změně restartuj Vite.
Produkční build používá stejnou proměnnou; Docker ji přijímá jako build argument,
produkční Compose ji předává z `.env.production`. Produkční `FRONTEND_ORIGINS`
musí povolovat skutečný origin frontendu; vývojové hodnoty se tam nepřenášejí.
Obě hodnoty jsou pro produkční Compose povinné.

V adresáři `frontend2`:

```sh
bun run api:generate
```

Orval 8 generuje typy, fetch funkce a TanStack Query 5 hooky ze schématu
`http://localhost:8000/api/v1/schema/?format=json` (nikoli z HTML Swagger UI).
Filtr `operationIds` v `orval.config.ts` zatím zahrnuje pouze napojené config/options;
při integraci dalších endpointů ho rozšiř.
Jiný zdroj lze zadat proměnnou `OPENAPI_URL`. Při generování uvnitř frontendového
kontejneru použij `http://backend:8000/api/v1/schema/?format=json`; to je adresa
pro generátor, **ne** pro browser. Po změně API klienta vždy regeneruj.

- `src/api/generated/` se verzionuje; neupravuj ručně. Generování ho obnoví
  a zformátuje. Aktuálnost ověř regenerováním a kontrolou diffu této složky.
- Běžný build ani unit testy nevyžadují živý backend ani regenerování klienta.
- `src/api/http.ts` přidává origin, `credentials: include`, lokální CSRF cookie
  u zápisů a `ApiError` se statusem a původním tělem chyby. Podporuje AbortSignal,
  FormData a prázdné odpovědi. Token bootstrap a cross-host admin auth jsou další krok.
  Síťové a parsovací chyby mohou být nativní `Error`; status čti až po `instanceof ApiError`.
- `src/api/queryClient.ts` nastavuje pětiminutovou čerstvost dat, nejvýše jeden
  retry čtení při síťové/serverové chybě, žádný retry 4xx ani automatický retry mutací.
- Hlavička/patička používají živou konfiguraci. Číselníky jsou v query cache,
  ale katalog a editor zatím stále používají demo varianty. Prázdné kontakty
  se nezastupují vymyšleným e-mailem; chyba API nabízí opakované načtení.

Standardní Playwright testy mockují tyto dva endpointy a nepotřebují backend.
Pro ověření skutečného CORS spojení z browseru se spuštěným Docker backendem:

```sh
bun run test:e2e:api
```

Tento smoke test používá `localhost` pro frontend i backend, ověřuje také
odeslání testovací cookie, pouze čte a nevytváří objednávky.

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

- Na backend jsou napojené config a katalogové číselníky. Skutečná autentizace,
  katalog, platby a objednávání zatím napojené nejsou.
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
