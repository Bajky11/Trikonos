# Propojení frontendu a backendu

Průběžný plán a checklist kompletní integrace. Aktualizováno 15. 11. 2026.
Implementace probíhá: základ čtení API, session a veřejný katalog jsou hotové;
košík zatím ukládá jen lokální výběr. Admin správa katalogu, skutečný košík
a obnova/změna hesla na FE ještě zbývají.
Úkol označit jako hotový až po
provedení a odpovídajícím ověření; zbývající omezení zapsat u dané etapy.

## Dohodnutá rozhodnutí

- Propojujeme celý nový frontend `frontend2/` s backendem `backend/`.
- Rozdíly mezi chováním FE a BE rozhodujeme po funkčních oblastech; ani jedna
  strana není automaticky úplným produktovým zadáním.
- **Bez API proxy ve frontendu.** Během vývoje browser volá přímo backend
  běžící lokálně v Dockeru, standardně `http://localhost:8000`.
  Frontend standardně běží na `http://localhost:5173`.
- Pro serverová data použijeme **TanStack Query** a **Orval** pro generování
  klienta, typů a query/mutation hooků z lokálního backendového OpenAPI.
  Zdrojem schématu je `http://localhost:8000/api/v1/schema/`, nikoli HTML
  Swagger UI na `/api/v1/docs/`.
- Frontendový katalog je **demo a nebude se importovat do databáze**.
  Živý katalog bude používat backendová data; prázdná databáze musí mít korektní UI.
- Sezóny, galerie, FAQ a recenze mohou **zatím zůstat v kódu**.
  Jejich budoucí správa je otevřený, odložený úkol, nikoli vyřešená oblast.
- Backend je autoritou pro ceny, dostupné kombinace, oprávnění a objednávkové
  přechody. Peněžní hodnoty backendu jsou v haléřích.
- Jednotlivé etapy implementovat a ověřovat postupně; tento dokument sám
  neznamená schválení dosud otevřených produktových rozhodnutí.
- Větší změny backendu předem konzultovat; není automaticky závazným zadáním.
  Nejprve hledat jednoduché řešení a testovat hlavně důležité chování, ne každou drobnost.

## Výchozí stav a orientace

- `frontend2/src/App.tsx`: homepage, katalog, detail a demo administrace;
  košíková stránka, checkout a zákaznický detail objednávky chybí.
- `frontend2/src/data/catalog.ts`: lokální demo katalog a varianty.
- `frontend2/src/components/ShopContext.tsx`: demo košík v localStorage,
  bez serverové validace a dokončení nákupu.
- `frontend2/src/components/CustomPrint.tsx`: editor vlastního potisku.
- `frontend2/src/pages/AdminPage.tsx`: demo přehled, číselníky a zástupné sekce.
- `backend/settings/urls.py`: rozcestník existujícího API.
- Backend má API katalogu, uploadů, validace košíku, objednávek, session auth
  a rozsáhlou administraci. Existence endpointu není ověření jeho integrace.
- `frontend2/tests/store.spec.ts`: současné testy očekávají demo režim,
  včetně loginu bez API; upravovat je spolu s příslušnou implementací.
- `README.md`, `docker-compose.dev.yaml`, `docker-compose.yaml`: běh a nasazení.

## 1. Komunikační základ, Orval a autentizace

- [x] Ověřit lokální backend v Dockeru a dostupnost OpenAPI.
- [x] Ověřit testy aplikačních modulů backendu a stávající frontendové scénáře.
- [ ] Ověřit úplnost schématu, camelCase, povinná pole, chyby, stránkování,
  uploady a binární odpovědi proti skutečnému API; nesrovnalosti opravit u zdroje.
- [x] Přidat TanStack Query provider a Orval konfiguraci; před přidáním
  závislostí ověřit kompatibilní aktuální verze a jejich dokumentaci.
- [x] Zavést opakovatelný příkaz generování z lokálního schématu; určit,
  které generované soubory se verzují a jak se kontroluje jejich aktuálnost.
  Běžný build nemá nečekaně vyžadovat dostupnost lokálního backendu.
- [x] Zavést konfigurovatelnou API base URL bez frontendové proxy a společnou
  transportní vrstvu pro credentials, CSRF a normalizaci chyb. Generovaný kód
  neupravovat ručně; vlastní chování držet mimo něj.
- [x] Nastavit lokální CORS, credentials a CSRF trusted origins; zdokumentovat
  cookie rozdíl mezi `localhost` a `127.0.0.1`. Produkční session ověření zbývá.
- [x] Ověřit získání CSRF tokenu i jeho obnovu po loginu; při odlišném hostname
  nelze automaticky předpokládat čitelnost backendové CSRF cookie z FE.
- [x] Napojit config a katalogové číselníky, generované query keys, pětiminutovou
  čerstvost cache a omezené retry čtení; zakázat automatické retry mutací.
- [ ] Doplnit cílené invalidace při zavádění mutací jednotlivých oblastí.
- [x] Napojit login, logout, session/me, expiraci session;
  chránit admin routy a správně obsloužit 401/403.
- [ ] Doplnit frontendové formuláře změny a obnovy hesla.

**Ověření etapy:** reálné config/options požadavky a session po reloadu;
úspěšné i zamítnuté CORS/CSRF požadavky, odhlášení a nepovolené admin operace.

### Záznam prvního integračního kroku (15. 11. 2026)

- TanStack Query 5.107.1 a Orval 8.48.0. `bun run api:generate` generuje
  verzovaný klient ze živého lokálního schématu; build generátor nespouští.
- Opravena camelCase pole schématu pomocí backendového postprocessing hooku;
  kontraktové testy porovnávají config/options se skutečnými odpověďmi.
- Hlavička/patička čerpají konfiguraci, číselníky se načítají do query cache.
  Demo katalog, editor a demo login zatím zůstávají beze změny chování.
- Jednotkové testy transportu ověřují credentials, chyby, CSRF cookie včetně
  rotace, FormData, prázdnou odpověď a AbortSignal. Není to ověření celého loginu.
- Prohlížečové testy ověřují loading, prázdné kontakty, chyby, retry a cache;
  samostatný `bun run test:e2e:api` ověřuje skutečné CORS čtení Docker API.
- Frontend: check a build prošly, 16 unit testů a 9 standardních E2E testů
  prošlo; samostatný živý API smoke test také prošel. Regenerování klienta
  podruhé nezměnilo žádný z 11 generovaných souborů. Generují se pouze napojené
  operace config/options; filtr rozšiřovat s další integrací, lint platí i pro ně.
- HTTP chyby si zachovávají status i při neplatném JSON, vlastní `Accept` se
  nepřepisuje a typy chyb zahrnují i nativní síťové chyby. Živý smoke test ověřuje
  skutečné odeslání testovací cookie mezi lokálními porty.
- Produkční Compose vyžaduje API build URL a povolené originy z env;
  chybějící hodnoty odmítne namísto použití `localhost` návštěvníka.
  Produkční nasazení ani cross-host session tok zatím nebyly ověřeny.
- Backend: cílený běh `pytest accounts catalog customers orders shipping core -q`
  prošel (149 passed, 1 skipped). Samotné `pytest -q` blokuje existující import
  v `implementation_rules/test_services.py`; mimo rozsah této integrace.
- **Další krok:** skutečné přihlášení, session/me, logout a ochrana admin rout;
  teprve poté pokračovat katalogem. Úplný audit schématu ostatních oblastí zbývá.

### Session přihlášení (15. 11. 2026, navazující změny)

- Předchozí základ integrace je v commitu `b96750d`. Navazující změny se
  necommitují bez dalšího výslovného rozhodnutí uživatele.
- Skutečný login v patičce a `/prihlaseni`, kontrola `/auth/me` před admin routou,
  návrat na původní administrační URL, logout, ověření po reloadu/focus a polling
  přihlášené session. Síťová chyba není zaměněná za anonymního uživatele.
- CSRF bootstrap zůstává `204`, navíc vrací token v hlavičce `X-CSRFToken`
  vystavené přes CORS. Login vynucuje CSRF i anonymně a po rotaci vrací nový token.
  Není potřeba rozšiřovat cookie doménu ani persistovat token do web storage.
- Session zůstává v httpOnly cookie, po odhlášení/expiraci se čistí chráněná cache.
  Heslo se po pokusu odstraní z formuláře a mutation cache. Všechny backendové
  účty jsou administrátorské; nevymýšlíme nové role.
- Orval nyní zahrnuje čtyři auth operace, celkem 13 generovaných souborů.
  Při čištění generovaného adresáře vynechává runtime modul, aby neztratil Vite HMR
  sledování souboru. Katalog a obsah adminu zůstávají demo.
- Živý lokální test `bun run test:e2e:auth` ověřil skutečný login, reload a logout.
  Produkční domény/HTTPS nebyly nasazovány ani ověřovány.
- Ověření: frontend check/build, 21 unit testů, 16 standardních E2E testů,
  oba živé API/auth testy; backendové aplikační sady 152 passed, 1 skipped.
  Obnova/změna hesla a napojení administračních dat nejsou součástí tohoto kroku.

## 2. Katalog a jeho administrace

- [x] Napojit kontakty, hlavičku a patičku na backendovou konfiguraci tam,
  kde odpovídá schválenému obsahu; obsahové sekce mohou zůstat statické.
- [x] Nahradit demo katalog živými kategoriemi a motivy bez importu demo dat.
- [x] Namapovat hledání, filtry, řazení, stránkování a URL parametry.
- [x] Použít stávající `/produkt/...` s backendovým slugem; napojit detail,
  obrázky, související motivy a ručně řazený homepage výběr.
- [ ] Dohodnout obchodní definici bestsellerů před použitím `popular`:
  backend nyní počítá i položky nezaplacených/zrušených objednávek.
- [x] Nahradit lokální varianty backendovými ID a povolenými kombinacemi;
  sjednotit zobrazování cen v Kč z hodnot v haléřích.
- [x] Doplnit loading, empty, error, 404 a nedostupné varianty.
- [x] Napojit admin CRUD motivů a jejich povolených variant.
- [x] Napojit správu obrázků a jejich pořadí.
- [x] Napojit správu kategorií, typů oblečení, barev, střihů a tiskových ploch;
  velikosti zobrazit pouze pro čtení podle skutečné podpory API.
- [x] Po změnách motivů/variant invalidovat odpovídající data a ověřit nové načtení.
- [x] Po změnách číselníků obnovit veřejný katalog/options i volby admin formulářů.
- [ ] Před produkcí dohodnout přísnější pravidla mazání číselníků, pokud jsou žádoucí:
  dnešní CASCADE maže varianty, barva použitá pouze v JSON fotografií nemá FK ochranu.

**Ověření etapy:** katalog a detail čerpají z API; admin změna se po načtení
projeví ve storefrontu, prázdný katalog nepadá a nenahrazuje se skrytě demem.

### Veřejný katalog a položka košíku (15. 11. 2026)

- Session je v commitu `1600c27`, veřejný katalog v uživatelem schváleném commitu `0bb52a7`.
- Uživatel schválil přibrat k veřejnému katalogu minimální úpravu katalogové
  položky košíku; checkout a editor vlastního potisku se funkčně nemění.
- Katalog, hledání, kategorie, řazení, detail, fotografie a související motivy
  jsou napojené přes Orval. Backend dostal opravy OpenAPI popisu filtrů,
  nepaginovaného related a tvaru obrázků. U řazení podle ceny/data se doplnilo ID
  jako stabilní poslední klíč pro stránkování; obchodní logika se nemění.
- Odstraněn generovaný demo katalog. Statické sezónní fotografie zůstávají v kódu.
  URL používá slug; košík ukládá UUID motivu a všech součástí vybrané varianty.
- `trikonos-cart-v2` zachovává staré custom drafty, ale nepřebírá falešné demo
  katalogové položky. Cena je pouze snapshot v haléřích, server ji musí znovu ověřit.
- Ve skutečné lokální DB nemají první ověřené motivy povolené varianty;
  frontend je správně nepovažuje za objednatelné. Do DB se nic nepřidávalo.
- Testy jsou soustředěné na katalog → varianta → košík → reload, prázdný/error stav
  a migraci úložiště. Nejde o dokončení celé etapy 2 (správa katalogu zbývá).
- Ověření: check/build, 20 unit testů, 17 standardních E2E, 2 živé API/auth testy
  a 30 cílených backendových testů katalogu/kontraktu prošly. Ve skutečné lokální
  DB se ověřil i nedostupný motiv; přidání povolené varianty pokrývají řízená API data.
- Zbývá `/cart/validate`, plné uživatelské flow košíku, vlastní upload a checkout.

### Administrace motivů a variant (15. 11. 2026)

- `/admin/produkty` nyní spravuje skutečné motivy: hledání, filtry, stránkování,
  vytvoření, editace, koncept/publikace a potvrzené smazání. Motiv použitý
  v objednávce nelze smazat; UI nabízí vysvětlení a lze jej deaktivovat.
- Povolené kombinace mají samostatný CRUD a stránkování. Číselníky se zatím pouze
  čtou, ze všech stránek a včetně neaktivních položek. Fotografie a CRUD číselníků
  jsou další samostatné kroky, nikoli dokončená součást této práce.
- Editace vždy posílá současný explicitní slug; existující backendová politika
  regenerace při chybějícím slugu se nemění. Nové motivy jsou implicitně koncepty.
- Orval zahrnuje jen používané admin operace. Drobné backendové opravy zpřesňují
  OpenAPI request/response a filtry, zajišťují `ordersCount: 0` po vytvoření
  a odmítají prázdný automaticky vygenerovaný slug.
- Sdílený CSRF bootstrap chrání zápisy i po reloadu. Mutace invalidují příslušnou
  admin a veřejnou cache; změna variant neresetuje formulář základních údajů.
- Ověření: check/build, 21 unit testů, 19 standardních E2E a 31 backendových testů
  katalogu/core prošly. Oba živé API/auth testy také prošly; admin seznam, detail
  a varianty ověřily pouze čtením, skutečná katalogová data se neměnila.
  Build nadále hlásí existující upozornění na hlavní JS chunk přes 500 kB;
  backendové testy mají stávající Django/DRF deprecation warnings.
- Správa motivů a variant byla na pokyn uživatele commitnutá jako `a8c079f`; bez pushe.

### Fotografie motivů (15. 11. 2026)

- V `/admin/produkty` přibyl dialog Fotografie: upload JPG/PNG/WEBP do 10 MB,
  popisek, volitelné přiřazení k barvě, změna pořadí šipkami a potvrzené mazání.
  První fotografie je hlavní obrázek katalogu. Po zápisu se invaliduje admin detail
  i veřejná cache; formulář po úspěšném uploadu vyčistí výběr souboru a metadata.
- Využívá stávající backendové úložiště: originál a dva náhledy v
  `media/motifs/<UUID>/`, v persistentním volume `dev_media_data` / `media_data`.
  Databáze ukládá metadata a cesty. Produkční zálohy musí zahrnovat obojí.
- Backend dostal přesný OpenAPI popis obrázků, binárního multipart uploadu
  a PATCH metadat. Orval generuje skutečný FormData klient; transport neurčuje
  multipart Content-Type ručně, boundary vytváří browser.
- Drobná validace odmítá duplicitní ID při změně pořadí, která dříve mohla
  zdvojit záznam fotografie. Stávající backendové testy byly rozšířeny o tento
  případ, camelCase odpověď a nastavení/odebrání barvy.
- Jeden ucelený nový E2E scénář ověřuje upload včetně odmítnutí, zachování možnosti
  opakovat požadavek, metadata, pořadí, potvrzení mazání, CSRF a veřejnou cache.
- Ověření: check/build, 21 unit testů, 20 standardních E2E, oba živé API/auth testy
  a 31 backendových testů katalogu/core prošly. Živé ověření fotografií pouze četlo;
  upload a mazání se testovaly na izolovaných datech. Skutečná katalogová DB ani
  media volume nebyly doplňovány či měněny. Stávající build/deprecation warnings zůstávají.
- Fotografie byly na pokyn uživatele commitnuté jako `7d6c5c4`; bez pushe.

### Katalogové číselníky (16. 11. 2026)

- `/admin/ciselniky` nahradil lokální demo skutečným CRUD kategorií, barev, střihů,
  typů oblečení a tiskových ploch. Zahrnuje hledání, filtr stavu, stránkování,
  pořadí, deaktivaci, potvrzené mazání a filtr ploch podle typu oblečení.
- Formuláře posílají cenu typu v haléřích, HEX barvy a kladné celočíselné rozměry
  ploch v mm. Kategorie při editaci posílá explicitní slug; deaktivace kategorie
  neskrývá její motivy. Velikosti jsou pevný seznam backendu, pouze pro čtení.
- Stará data `trikonos-react-dictionaries-v1` se ignorují, neimportují se do DB.
  Statické volby editoru vlastního potisku se tím nemění; jeho napojení zbývá.
- Mutace invalidují veřejné kategorie/motivy/options i odpovídající privátní cache
  včetně stránkovaných lookupů a variantových voleb. Session cache se nemění.
- Backend dostal OpenAPI parametry filtrů, opravu popisu `productType` u ploch,
  stabilní ID tiebreaker pro stránkování lookupů a odmítnutí prázdného generovaného
  slugu kategorie. Obchodní pravidla mazání ani struktura DB se neměnily.
- UI upozorňuje na existující CASCADE variant (barva/střih/typ) a ploch (typ),
  doporučuje deaktivaci a před smazáním barvy změnu přiřazení fotografií.
  Větší změna těchto backendových pravidel vyžaduje samostatné odsouhlasení.
- Dva ucelené nové E2E scénáře pokrývají stránkování, hledání, duplicitu, reload,
  CRUD, CSRF, obnovu variantových voleb, stabilní URL, `IN_USE`, cenu typu ve
  veřejném detailu, rozměry ploch a read-only velikosti. Starý demo CRUD test
  byl nahrazen; jeden backendový kontraktový test pokrývá klíčové číselné/URL hranice.
- Ověření: check/build, 21 unit testů, 22 standardních E2E, oba živé API/auth testy
  a 47 backendových testů (catalog/core 32, shipping 15) prošly. Živé ověření pouze
  četlo; skutečná katalogová DB ani media se neměnily. Build/deprecation warnings
  zůstávají stejné jako v předchozích krocích.
- Číselníky byly na pokyn uživatele commitnuté jako `0427974`; bez pushe. Další ucelený krok: košíková stránka
  a serverová validace katalogových položek přes `/cart/validate`; vlastní potisk
  bude vyžadovat samostatné potvrzení UX a kontraktu.

## 3. Košík a vlastní potisk

- [x] Definovat backendové identifikátory katalogových položek a verzovaný formát
  lokálního košíku; staré demo ceny se nepřevádějí do objednávek.
- [x] Převést nové vlastní potisky PNG/JPG na serverový kontrakt; staré demo drafty
  zachovat jako neověřené, neimportovat je automaticky.
- [x] Doplnit košíkovou stránku, editaci množství, odebrání a obnovu po reloadu.
- [x] Napojit `/cart/validate` pro katalogové položky; zobrazit změnu ceny,
  nedostupnost a chyby. Lokální cena není autoritativní.
- [x] Rozšířit validaci o nový vlastní potisk a skutečný `requiresQuote`.
- [ ] Doplnit volbu dopravy; neznámou cenu/dopravu nyní zobrazovat bez konečného součtu.
- [x] U `/cart/validate` ověřit CSRF hosta i přihlášeného administrátora.
- [x] Ověřit CSRF a skutečný multipart upload podkladu v izolovaných testech.
- [ ] Stejné ověření provést pro budoucí vytvoření objednávky;
  současné veřejné API dědí session autentizaci.
- [x] Napojit editor na tiskové plochy, rozměry v mm a serverová transformační
  pravidla; otestovat převod souřadnic a meze návrhu.
- [x] Napojit multipart upload PNG/JPG a `fileToken`, ošetřit limity, chyby
  a expiraci tokenu; nové obrázky neukládat do localStorage.
- [ ] Při nasazení naplánovat existující `cleanup_orphan_designs` pro opuštěné uploady.
- [ ] SVG/PDF řešit samostatně včetně bezpečného zpracování a náhledu.
- [x] Dohodnout UX vlastního potisku a smíšeného košíku: objednávka k nacenění
  versus nabídka ke schválení; neprezentovat neznámou cenu jako nulovou.

**Ověření etapy:** katalogové i vlastní položky se obnoví a projdou serverovou
validací; testy pokryjí změnu ceny, neplatnou variantu a expirovaný upload.

### Košíková stránka a validace katalogu (16. 11. 2026)

- `/kosik` používá dosavadní `trikonos-cart-v2`, umožňuje uložit počet kusů,
  odebrat položku a přijmout novou serverovou cenu jako snapshot. Selhání úložiště
  nemění zobrazený košík a nehlásí úspěch. Limit množství zůstává frontendových 1–99.
- Read-only POST `/cart/validate` se volá při otevření a po potvrzené změně počtu.
  TanStack Query odděluje výsledky podle odeslaných položek; při čekání nebo chybě
  se starý součet netváří jako ověřený. Neodesílají se snapshoty cen ani názvů.
- API vrací chyby nedostupných kombinací po řádcích. U neexistujícího ID dnešní
  serializer odmítá celý požadavek 400 a chybová obálka nezachovává indexy řádků;
  UI proto ukáže globální chybu a žádný ověřený součet. Kontrakt se neobcházel
  jednotlivými POST pro každou položku (API má 10 požadavků/min/IP).
- Opakování kontroly je ruční, bez automatického retry nebo refetch na focus.
  CSRF používá dosavadní bootstrap a funguje i po reloadu s admin session.
- Malá backendová oprava vždy ignoruje klientské `unitPrice` také v náhledu
  košíku, stejně jako veřejné vytvoření objednávky. Jinak šlo podvrhnout cenu
  validace. Objednávka ani žádná položka se při kontrole nevytváří.
- Vlastní potisk zůstává výslovně neověřený lokální návrh; neposílá se s katalogem
  a jeho demo cena není součástí ověřeného mezisoučtu. Chybějící doprava a konečná
  cena se neprezentují jako zdarma/nula. Checkout ani upload nejsou rozšiřované.
- Jeden unit test hlídá mapování položek bez cen/custom draftů. Dva ucelené E2E
  scénáře pokrývají přecenění, množství, reload, mazání, selhání úložiště, chybu API,
  nedostupnou variantu a smíšený košík. Dva backendové testy ověřují CSRF, přecenění
  a chování neplatných/smazaných referencí bez perzistence objednávek.
- Ověření: check bez chyb, 22 unit testů, build, 24 standardních E2E, oba živé testy
  a 149 backendových testů (1 skipped) prošly. Živý test ověřil také skutečný
  validační POST; katalogová DB ani media se neměnily.
- Check nově hlásí dvě neblokující duplicity `NullEnum | null` v Orvalem
  generovaných volitelných parametrech dopravy/platby. Generované typy nebyly ručně
  opravované. Stávající varování velikosti JS chunku a Django/DRF zůstávají.
- Košík byl na pokyn uživatele commitnutý jako `201bbf9`; bez pushe.

### Vlastní potisk PNG/JPG a smíšený košík (16. 11. 2026)

- Uživatel schválil celý smíšený košík k nacenění a první krok pouze s PNG/JPG;
  SVG/PDF i checkout jsou mimo tento rozsah. Katalogové ceny jsou známé, konečnou
  cenu celé objednávky s vlastním potiskem musí potvrdit administrátor.
- Editor načítá skutečné typy, střihy, barvy, velikosti a tiskové plochy. Nabízí
  jeden podklad na jednu plochu v položce, bez vymyšlených voleb při prázdném API.
  Statická galerie zůstává v kódu, ale vybraný obrázek se skutečně nahraje.
- Podklad PNG/JPG do 20 MB prochází Orval multipart klientem a CSRF bootstrapem.
  V košíku je pouze `kind: custom`, metadata uploadu, `fileToken`, skutečná ID a
  umístění; žádný nový base64 obrázek nebo demo cena 456 Kč. Staré demo drafty
  se nepřevádějí a zůstávají výslovně neověřené.
- Náhled drží fyzický poměr stran plochy. Posun/resize/centrování používají její
  meze, převod na celá mm zůstává uvnitř backendových rozměrů i po zaokrouhlení.
  Změna plochy/rozměrů nesmí použít souřadnice z jiné plochy. Oděv je ilustrační.
- `/cart/validate` ověřuje nové vlastní i katalogové položky v jednom požadavku,
  zobrazuje skutečné `requiresQuote` a zachovává známý katalogový mezisoučet bez
  vydávání neznámé ceny potisku za nulu. Neplatný/prošlý token vyžaduje nový upload
  a nahrazení staré položky, která se sama nemaže. Platnost tokenu je 7 dní.
- Malé backendové opravy: přesný binární multipart OpenAPI popis, ověření a
  dekódování rastru před uložením a oprava lokálního `_`, který překrýval překlady
  a vedl na 500 u chyb uploadu. Business workflow a datový model se neměnily.
- Opuštěné uploady řeší existující příkaz `cleanup_orphan_designs` (soubory starší
  7 dní bez vazby na objednávku); produkční plánování zbývá. DELETE upload API
  neexistuje. UI tedy neprovádí destruktivní mazání podkladů při odebrání návrhu.
  Podklady jsou běžné veřejné media URL; soukromé řízení přístupu není doplněné.
- Ověření: check bez chyb (stejné 2 Orval warnings), 24 unit testů, build,
  26 standardních E2E, oba živé API/auth testy a 150 backendových testů (1 skipped)
  prošly. Nové scénáře pokrývají upload/CSRF/limity/poškozený soubor, geometrii,
  smíšený košík, reload a expiraci tokenu. Uploady se testovaly v mock browser API
  a izolovaném backendovém MEDIA_ROOT; do skutečné katalogové DB ani media se
  podklady nedoplňovaly. Jeden starší upload test byl také izolován do tmp_path.
- Tento krok zůstává necommitnutý a nepushnutý. Další bod: checkout, zákaznické
  údaje a volba dopravy/platby podle skutečných možností backendu; finální online
  platební brána není automaticky součástí.

## 4. Checkout a zákaznická cesta

- [ ] Doplnit checkout: zákazník, fakturační/doručovací adresa, validace,
  obchodní podmínky a případný marketingový souhlas.
- [ ] Dohodnout podporované dopravní a platební metody; odlišit evidenci
  platebního stavu od skutečné online platební brány.
- [ ] Napojit ceny dopravy, dobírku, osobní odběr a výdejní místo Packety
  podle schváleného způsobu výběru a serverových požadavků.
- [ ] Pokud bude požadována online platba, samostatně navrhnout a doplnit
  bránu, ověření výsledku na serveru, webhooky a selhané/opakované platby.
- [ ] Napojit vytvoření objednávky, idempotentní `orderId`, ochranu před
  dvojklikem a bezpečné opakování po výpadku spojení.
- [ ] Doplnit potvrzení, zákaznický detail a dohledání objednávky;
  chránit access token před únikem do logů, analytiky a refererů.
- [ ] Napojit kontakt/poptávku, honeypot, chyby odeslání a skutečné e-maily.
- [ ] Ověřit texty a notifikace pro běžnou objednávku i následné nacenění.

**Ověření etapy:** E2E nákup katalogové položky i scénář vlastního potisku
a dohledání objednávky; opakovaný submit nevytvoří duplicitní objednávku.

## 5. Provozní administrativa

- [ ] Dohodnout role a oprávnění; UI nesmí nahrazovat serverovou autorizaci.
- [ ] Napojit skutečný přehled, globální hledání, filtry a stránkování;
  ověřit chybějící statistiky a případně doplnit agregace na backendu.
- [ ] Doplnit seznam/detail objednávek, změny údajů, potvrzení a nacenění,
  platební stavy a akce podle `allowedTransitions` a uzamčení objednávky.
- [ ] Doplnit zásilky, štítky, tiskové listy, stažení binárních souborů a e-maily.
- [ ] Napojit výrobu: tiskové podklady, souhrny a příslušné filtry.
- [ ] Napojit zákazníky, historii objednávek, souhlasy a jejich export.
- [ ] Napojit dopravce, ceny dopravy, množstevní slevy a nastavení Packety.
- [ ] Napojit správu uživatelů včetně bezpečného vytvoření a změn účtů.

**Ověření etapy:** oprávněný pracovník zpracuje objednávku od přijetí přes
nacenění/výrobu po odeslání; zakázané akce odmítá i backend.

## 6. Nasazení, testy a úplnost

- [ ] Průběžně nahrazovat demo testy testy skutečných kontraktů a chování;
  používat izolovaná testovací data, nikoli produkční objednávky.
- [ ] Doplnit unit testy převodů cen, geometrie a košíku; integrační testy
  chyb, stránkování, uploadů, idempotence, session/CSRF a oprávnění.
- [ ] Projít všechny schválené FE oblasti a potřebné BE workflow;
  odstranit či jasně označit zbývající demo akce.
- [ ] Ověřit FE build, backendové testy a E2E proti skutečnému lokálnímu API.
- [ ] Nastavit produkční API URL, povolené originy, HTTPS cookies a CSRF;
  otestovat přímé cross-origin volání mezi skutečnými doménami bez FE proxy.
- [ ] Ověřit veřejné adresy médií, privátní podklady, limity uploadu, SMTP,
  bezpečné logování, databázové migrace a zálohy DB/médií před nasazením.
- [ ] Aktualizovat návody pro vývoj, generování klienta, testování a nasazení.

**Ověření etapy:** schválené hlavní scénáře projdou v prostředí podobném
produkci; zbývající omezení a odložené úkoly jsou výslovně zaznamenané.

## Odložené / otevřené věci

- [ ] **Vyřešit budoucí správu obsahu:** sezóny, galerie, FAQ a recenze jsou
  zatím v kódu. Později rozhodnout rozsah administrace a případné backendové
  modely, API, média a migraci obsahu. Není to blokátor první integrace.
- [ ] Dohodnout pravidla skutečných bestsellerů; homepage zatím používá ruční pořadí (etapa 2).
- [ ] Dohodnout obchodní proces vlastního potisku a schválení ceny (etapa 3).
- [ ] Dohodnout platby, případnou bránu a výběr výdejních míst (etapa 4).
- [ ] Dohodnout role a potřebné statistiky administrace (etapa 5).

## Pravidlo pokračování

Začít etapou 1. Před každou další etapou uzavřít jen rozhodnutí, která ji
ovlivňují. Po dokončení zaznamenat splněné položky, skutečné ověření a nově
zjištěné mezery; zaškrtnutí nemá znamenat pouze existenci kódu.
