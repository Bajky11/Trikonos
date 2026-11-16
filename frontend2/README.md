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
Filtr `operationIds` v `orval.config.ts` zahrnuje config/options, session, veřejný katalog
a používané administrační operace motivů, variant, fotografií a katalogových číselníků;
při integraci dalších endpointů ho rozšiř.
Jiný zdroj lze zadat proměnnou `OPENAPI_URL`. Při generování uvnitř frontendového
kontejneru použij `http://backend:8000/api/v1/schema/?format=json`; to je adresa
pro generátor, **ne** pro browser. Po změně API klienta vždy regeneruj.

- `src/api/generated/` se verzionuje; neupravuj ručně. Generování ho obnoví
  a zformátuje. Aktuálnost ověř regenerováním a kontrolou diffu této složky.
- Běžný build ani unit testy nevyžadují živý backend ani regenerování klienta.
- `src/api/http.ts` přidává origin, `credentials: include`, lokální CSRF cookie
  u zápisů a `ApiError` se statusem, kódem a původním tělem chyby. Podporuje AbortSignal,
  FormData a prázdné odpovědi. Bootstrap a login vracejí token také v CORS-exposed
  hlavičce; pokud není cookie čitelná, token zůstává pouze v paměti transportu.
  Síťové a parsovací chyby mohou být nativní `Error`; status čti až po `instanceof ApiError`.
- `src/api/queryClient.ts` nastavuje pětiminutovou čerstvost dat, nejvýše jeden
  retry čtení při síťové/serverové chybě, žádný retry 4xx ani automatický retry mutací.
- Hlavička/patička používají živou konfiguraci. Katalog používá živé kategorie,
  motivy a povolené varianty; pouze editor vlastního potisku je zatím demo. Prázdné kontakty
  se nezastupují vymyšleným e-mailem; chyba API nabízí opakované načtení.

Standardní Playwright testy mockují API a nepotřebují backend.
Pro ověření skutečného CORS spojení z browseru se spuštěným Docker backendem:

```sh
bun run test:e2e:api
```

Tento smoke test používá `localhost` pro frontend i backend, ověřuje také
odeslání testovací cookie, pouze čte a nevytváří objednávky.
Pokud jsou v databázi dostupné varianty, ověří také jejich přidání do lokálního
košíku a obnovu po reloadu. Prázdný katalog/nedostupné varianty jsou platný stav.

### Katalog a lokální košík

- `/tricka` načítá seznam po 12 položkách, kategorie, hledání (`q`) a řazení
  (`razeni`). Filtr `kategorie` a stránka `strana` zůstávají v URL; API dostává
  `category`, `page` a `pageSize`. Neplatnou stránku lze vrátit na první.
- `/produkt/:slug` načítá detail a související motivy. Obrázky relativní k backendu
  se načítají z API originu; chybějící či rozbité náhledy mají neutrální placeholder.
- Volby typu oblečení, střihu, barvy a velikosti vycházejí z průniku aktivních
  číselníků a povolených kombinací motivu. Bez variant nelze produkt přidat.
- Ceny API i katalogové snapshoty jsou v haléřích. Karta označuje základní cenu
  motivu, detail přičítá příplatek vybraného typu oblečení.
- `src/cart/storage.ts` ukládá reálná ID a vybranou variantu pod `trikonos-cart-v2`.
  Staré demo katalogové položky se nepřevádějí, staré návrhy vlastního potisku se
  zachovají. **Snapshot ceny ani lokální validace nejsou serverové ověření košíku.**
  Před objednávkou bude nutné napojit `/cart/validate`; checkout zatím neexistuje.
- Homepage používá ruční pořadí jako „Výběr z kolekce“. Skutečné bestsellery jsou
  odložené: současné backendové `popular` nerozlišuje stavy objednávek. Data ani
  varianty se v této integraci neimportují a nedoplňují do databáze.

### Administrace motivů, variant a fotografií

- `/admin/produkty` používá skutečný seznam motivů, hledání, filtr kategorie/stavu
  a stránkování. Umožňuje vytvoření, úpravu a potvrzené smazání motivu.
- Nový motiv je výchozím nastavením koncept. Editace posílá explicitní slug,
  aby běžná změna ceny neměnila veřejnou URL. Motiv použitý v objednávce se místo
  smazání deaktivuje; chybu backendu UI nezamění za úspěch.
- Dialog variant spravuje jednotlivé kombinace typu oblečení, střihu, barvy
  a velikosti, včetně jejich deaktivace. Číselníky se čtou ze všech stránek,
  včetně označených neaktivních položek. Duplicitu odmítá backend.
- Dialog Fotografie nahrává JPG/PNG/WEBP do 10 MB přímo přes backendové multipart API.
  Server kontroluje obsah a ukládá originál i náhledy (400 a 1200 px) do
  `media/motifs/<UUID>/` v persistentním Docker volume. V databázi jsou metadata.
- Lze změnit popisek, přiřadit/odebrat barvu a šipkami změnit pořadí; první fotografie
  je hlavní obrázek katalogu. Potvrzené smazání odstraní originál i oba náhledy.
- Zápisy používají CSRF bootstrap a invalidují odpovídající admin i veřejnou cache.
  Fotografie se neukládají do localStorage. Produkční zálohy musí zahrnovat databázi
  i media volume.

### Katalogové číselníky

- `/admin/ciselniky` používá backendový CRUD kategorií, barev, střihů, typů oblečení
  a tiskových ploch, hledání, stav aktivní/neaktivní, stránkování a editovatelné pořadí.
  Plochy lze filtrovat podle typu oblečení. Velikosti jsou pevný backendový seznam,
  zobrazený pouze pro čtení; kombinace velikostí motivu se spravují u jeho variant.
- Cena typu se zadává v Kč a posílá v haléřích, rozměry ploch v celých kladných mm.
  Kategorie při editaci posílá explicitní slug, aby změna názvu neměnila URL.
  Deaktivace kategorie skryje navigační kategorii, nikoli automaticky její motivy.
- Po zápisu se obnoví související admin seznamy, volby formulářů, veřejné kategorie,
  katalog a options. Zápisy používají stejný CSRF bootstrap jako správa motivů.
- Mazání se potvrzuje a respektuje stávající backendové vazby: `IN_USE` není úspěch.
  Barva/střih/typ mohou smazat i povolené kombinace, typ také své tiskové plochy,
  pokud tomu nebrání chráněné vazby. U barvy předem změňte přiřazení fotografií.
  Bezpečnější je deaktivace; pravidla CASCADE/PROTECT se touto integrací nemění.
- Staré lokální demo číselníky se nečtou ani neimportují do DB. Editor vlastního
  potisku má stále vlastní demo volby; jeho funkční napojení je samostatný krok.

### Přihlášení a session

Login v patičce i `/prihlaseni` používají stejný formulář a skutečné session API.
Přímé otevření `/admin/...` nejprve ověří `/auth/me`; anonymního uživatele pošle
na přihlášení a po úspěchu vrátí na původní administrační URL. Serverový výpadek
není považovaný za odhlášení a nabízí opakované ověření. Session se ověřuje také
po návratu na kartu a každou minutu, pokud je uživatel přihlášený.

Před loginem, logoutem i katalogovými zápisy proběhne CSRF bootstrap. Token se po loginu obnoví,
odhlášení/expirace odstraní chráněná query data. Profil ani přihlašovací údaje
se nepersistují do web storage; heslo se po pokusu vymaže z formuláře a mutation
cache. Neúspěšné odhlášení se nevydává za úspěšné.

```sh
bun run test:e2e:auth
```

Tento test **provádí login a logout** pouze proti lokálnímu backendu; administraci
motivů, detail, varianty, fotografie i číselníky ověřuje pouze čtením, bez změn katalogových dat. Výchozí
dev účet odpovídá Docker seedu (`admin@trikonos.cz` / `change-me`); vlastní
lokální testovací účet lze zadat přes `API_TEST_ADMIN_EMAIL` a
`API_TEST_ADMIN_PASSWORD`. Nikdy sem nevkládej produkční údaje. Živý test neběží
v běžné sadě E2E. Produkční cross-host/HTTPS cookies je nutné ověřit při nasazení.

```sh
bun run check       # formátování, lint a typová kontrola
bun run test        # jednotkové testy transportu, session, košíku a geometrie
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
výběr/nahrávání/úpravy potisku, administrativní vyhledávání, správu motivů/variant/fotografií
a backendový CRUD číselníků na řízených mock datech, invalidaci variantových voleb
a přenos nové ceny typu do veřejného detailu.

## Routy

- `/` — úvodní stránka, galerie realizací, sezóny, katalog, editor potisku a FAQ
- `/tricka` — celý katalog (`?kategorie=bitcoin&strana=2` pro filtr a stránku)
- `/produkt/:slug` — detail skutečného motivu podle slugu z API
- `/prihlaseni` — skutečné přihlášení do administrace
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
- `src/data/` — statický obsah, sezónní fotografie a zatím demo číselníky vlastního potisku
- `src/cart/` — typy, validace a obnova lokálního rozpracovaného košíku
- `src/admin/catalog/` — správa skutečných motivů, variant a fotografií
- `src/admin/lookups/` — správa katalogových číselníků a přehled pevných velikostí
- `public/` — samostatné kopie potřebných obrázků z původního frontendu, včetně
  dokumentace jejich zdrojů

Výchozí obrázek úvodu je `background/varianta1.png`. Přepínač alternativních
pozadí je odstraněný. Fonty DM Sans a Manrope se načítají lokálně z balíčků
Fontsource; aplikace nepotřebuje Google Fonts. Živý katalog vyžaduje dostupné API.

## Záměrná omezení prototypu

- Na backend jsou napojené config, katalog a jeho číselníky, správa motivů/variant/fotografií
  a session autentizace. Serverový košík, platby
  a objednávání zatím napojené nejsou.
- Rozpracovaný košík se ukládá do `localStorage` pod `trikonos-cart-v2`. Starý klíč
  `trikonos-react-dictionaries-v1` se již nepoužívá a jeho data se automaticky nepřenášejí.
- Nahrané obrázky vlastního potisku zůstávají v prohlížeči; větší soubor může přesáhnout jeho
  úložnou kvótu. Aplikace v takovém případě zobrazí chybu a nepotvrdí uložení.
- Obnova a změna hesla zatím nemají frontendové rozhraní.
- Statistiky, objednávky a recenze jsou ukázkové. Sekce Klienti má zástupnou
  obrazovku, Sezóny obsahují informační seznam.
- Vzhled byl laděn pro desktop. Mobilní rozložení není součástí této migrace.
- Je to vizuálně věrný přepis, nikoli garantovaná pixelová shoda každého stavu:
  formuláře, dialogy, tabulky a FAQ používají MUI a drobně se liší od nativního HTML.
