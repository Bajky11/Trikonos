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
Filtr `operationIds` v `orval.config.ts` zahrnuje config/options, session, veřejný katalog, validaci košíku, upload podkladů, vytvoření objednávky, zákaznický detail/dohledání a kontakt
a používané administrační operace objednávek, zákazníků, výroby, motivů, variant, fotografií a katalogových číselníků;
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
  motivy a povolené varianty; editor vlastního potisku čte stejné živé číselníky a tiskové plochy. Prázdné kontakty
  se nezastupují vymyšleným e-mailem; chyba API nabízí opakované načtení.

Standardní Playwright testy mockují API a nepotřebují backend.
Pro ověření skutečného CORS spojení z browseru se spuštěným Docker backendem:

```sh
bun run test:e2e:api
```

Tento smoke test používá `localhost` pro frontend i backend, ověřuje také
odeslání testovací cookie, pouze čte a nevytváří objednávky.
Pokud jsou v databázi dostupné varianty, ověří také jejich přidání do lokálního
košíku, obnovu po reloadu a read-only POST validaci. Bez povolených variant může
lokálním snapshotem ověřit odmítnutí kombinace; skutečnou databázi nemění.
Prázdný katalog/nedostupné varianty jsou platný stav.

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
  `/kosik` nyní katalogové položky i nové vlastní potisky serverově ověřuje; před budoucím vytvořením
  objednávky checkout kontrolu opakuje a server ještě porovnává odsouhlasené ceny.
- Homepage používá ruční pořadí jako „Výběr z kolekce“. Skutečné bestsellery jsou
  odložené: současné backendové `popular` nerozlišuje stavy objednávek. Data ani
  varianty se v této integraci neimportují a nedoplňují do databáze.

### Košíková stránka a serverová validace

- Tlačítko košíku otevírá `/kosik`. Položky lze odebrat, změnit počet (1–99),
  obnovit po reloadu a přijmout novou serverovou cenu jako lokální snapshot.
  Neúspěšný zápis do localStorage se nevydává za úspěch.
- Při otevření a po uložení změny množství se přes Orval volá `POST /cart/validate`.
  Odesílají se skutečná ID, velikost a množství, u nových vlastních potisků také
  tisková plocha, `fileToken` a umístění v mm; nikdy uložená cena/popisek.
  CSRF bootstrap funguje pro hosta i administrátora se session. Server nic neukládá.
- Výsledek patří konkrétním odeslaným položkám: během nové kontroly nebo po chybě
  se staré ceny netváří jako ověřené. Změna ceny je viditelná, nedostupná varianta
  má chybu u řádku; neznámé/smazané ID může backend odmítnout globální chybou 400.
- API má limit 10 kontrol/minutu na IP. Automatický retry a refetch na focus jsou
  vypnuté; množství se ověřuje až po „Uložit počet“, ne při každém stisku klávesy.
  Neúspěšné ověření lze ručně opakovat, 429 má zvláštní vysvětlení.
- Staré návrhy vlastního potisku zůstávají zachované a lze je odebrat nebo změnit
  počet, ale neposílají se do API. Nemají backendová ID/fileToken; jejich cena není
  potvrzená a nezapočítává se do ověřeného katalogového mezisoučtu.
- Nové vlastní potisky se ověřují společně s katalogem. `requiresQuote: true` znamená,
  že konečnou cenu celého smíšeného košíku potvrdí administrátor. Ověřené katalogové
  ceny zůstávají viditelné, vlastní potisk nemá vymyšlenou ani nulovou cenu.
- Doprava a odeslání jsou v `/pokladna`; konečná cena smíšeného košíku zůstává
  k nacenění administrátorem. `null` v ceně se nezobrazuje jako nula.

### Checkout a potvrzení objednávky

- `/pokladna` sbírá kontakt, fakturační a případnou odlišnou doručovací adresu,
  firmu/IČO/DIČ, poznámku, povinný souhlas s podmínkami a nepovinný marketingový souhlas.
  První krok je omezený na adresy v ČR, platbu převodem nebo při převzetí a na osobní
  odběr nebo doručení na adresu. Výdejní místa Packety, INVOICE a online brána jsou odložené.
- Dopravci a podporované metody vycházejí z veřejných options/config. Cenu dopravy,
  množstevní slevy i dobírku počítá `/cart/validate`, nikoli frontend. Neznámá cena
  dopravy blokuje odeslání. U osobního odběru posíláme žádného dopravce, cena dopravy je 0.
- **Schválené obchodní podmínky zatím nejsou připravené.** Ve frontendu je odeslání
  zablokované, dokud backendový config nevrací platnou `termsUrl`. Tu nastavuje
  `SHOP_TERMS_URL`; nepřidávej zástupný odkaz jen pro odblokování. Podmínky ani právní
  texty aplikace nevymýšlí. Backend nadále vyžaduje `termsAccepted`, ale URL gate
  je omezení UI, nikoli nové oprávnění veřejného API.
- V Dockeru nastav `SHOP_TERMS_URL` v kořenovém `.env` / `.env.production` a obnov
  backend (`docker compose -f docker-compose.dev.yaml up -d backend` pro vývoj),
  potom obnov stránku. Produkční Compose nově vyžaduje `FRONTEND_URL` pro odkazy
  v e-mailech. Před skutečným provozem nastav také `SHOP_BANK_ACCOUNT`, kontakty,
  `SHOP_NOTIFY_EMAIL`, SMTP a ověř doručení zpráv; prázdný účet se nenahrazuje smyšleným.
- Před `POST /orders` se znovu ověří shrnutí. Změna cen vyžaduje nové odsouhlasení.
  `expectedTotal`/`expectedShippingCost` jsou volitelné backendové pojistky: pokud
  se cena změní ještě mezi kontrolou a vytvořením, transakce skončí `PRICE_CHANGED`
  bez objednávky a e-mailů. Skutečné ceny se vždy počítají na serveru.
- Odesílaný požadavek se stejným `orderId` se uloží do `sessionStorage` až při
  odeslání, ne při vyplňování. Při nejasném výsledku (síť/5xx) zůstane košík uzamčený
  a po reloadu se nabídne pouze zopakování téhož těla/ID. Není automatický retry.
  Bez funkčního sessionStorage se objednávka vůbec neodešle. Nezavírej kartu, dokud
  výsledek neověříš; při ztrátě záznamu ověř objednávku přes e-mail/obchod, než založíš novou.
- Po potvrzeném přijetí se pending payload s kontaktem a adresami nahradí minimálním
  potvrzením, košík se vyprázdní jen pokud odpovídá odeslanému snapshotu. Při změně
  košíku nebo selhání úložiště se přijetí objednávky nevydává za neúspěch. Stejný
  již přijatý košík má ochranu před nechtěným opětovným objednáním.
- `/objednavka` načítá zákaznický detail, stav, částky, adresy a serverové platební
  instrukce. Nový katalogový nákup je potvrzený podle backendu; smíšená objednávka
  je `QUOTE_REQUESTED`, bez falešného součtu či výzvy platit před naceněním.
- Nové e-mailové odkazy používají `/objednavka#pristup=…`; fragment se na server
  neposílá a aplikace jej ihned odstraní z adresy. Token zůstává v sessionStorage
  této karty; nepatří do localStorage ani analytiky. Staré `/orders/:accessToken`
  se přesměruje na stejný detail. Otevření odkazu nepřepíše pending checkout.
  Referrer-Policy je `no-referrer`, privátní API odpovědi mají `no-store`.
- **Před produkcí:** API `/orders/access/{token}` a staré URL obsahují token v cestě,
  proto je nutné maskovat/vypnout jejich access logy na backendu i reverse proxy.
  Konzolový e-mailový backend loguje celé zprávy včetně odkazů, takže není vhodný
  pro skutečné objednávky. Backend zatím neeviduje verzi/čas přijetí právních dokumentů;
  to je samostatné právní/auditní doplnění před nasazením. Backoffice odkazy
  z interních e-mailů ještě čekají na napojení administrace objednávek.

### Dohledání objednávky a kontakt

- `/stav-objednavky` posílá číslo a e-mail na `POST /orders/lookup` a otevře
  stávající detail `/objednavka`. Oba údaje jsou pouze v těle požadavku, ne v URL
  či browser storage. Neshoda v kterémkoliv údaji vrací stejnou chybu. Limit je
  5 pokusů/min/IP, bez automatického retry. Odpovědi backendu mají `no-store`.
- Přístupový token je uložen odděleně v sessionStorage; jeho otevření ani reload
  nepřepisují pending checkout, nemažou košík a neodemykají nejisté odeslání.
- `/kontakt` používá `POST /contact`: jméno, e-mail, volitelný telefon a firma/tým,
  zpráva a skrytý honeypot `website`. Formulář je bez uploadu a nevytváří objednávku.
  Při chybě zůstane text vyplněný; po úspěchu se vymaže. Obsah se neukládá
  do localStorage/sessionStorage. Zápisy používají sdílené `withCsrf()`.
- Kontakt vyžaduje `SHOP_NOTIFY_EMAIL`; bez něj nebo při selhání e-mailového backendu
  vrátí 503 `CONTACT_UNAVAILABLE`. 204 znamená předání e-mailovému backendu, nikoli
  záruku doručení do schránky. Honeypot dál tiše vrací 204 bez odeslání. V produkci
  je nutné nastavit SMTP a ověřit doručení. Konzolový backend není skutečná pošta.
- Při síťové chybě zpráva mohla být přijata: neposílá se automaticky znovu.
  Kontakt nemá idempotenci objednávek. Odkazy na oba formuláře jsou v patičce.
- Testy `tests/customer-forms.spec.ts` používají mock API, neposílají skutečné
  zprávy ani nevytvářejí objednávky.

### Vlastní potisk: PNG/JPG k nacenění

- Editor používá typ oblečení s aktivní tiskovou plochou, samostatný střih, barvu
  a velikost z API. Bez skutečné plochy nenabízí demo náhradu. Zatím jde o jeden
  obrázek na jednu vybranou tiskovou plochu v položce; lze přidat více položek.
- Nahraný PNG/JPG do 20 MB i vybraný obrázek ze statické galerie prochází
  `POST /uploads/designs` s CSRF. Server kontroluje skutečný obsah a rastrový obrázek
  ověří/dekóduje. SVG/PDF se v editoru nenabízejí; jejich backendové zpracování
  a bezpečnost vyžadují samostatný krok. WebP není součástí veřejného upload API.
- Náhled zachovává poměr stran tiskové plochy z backendu. Posun, změna velikosti
  a centrování se převádějí na celá mm od jejího levého horního rohu a zůstávají
  uvnitř rozměrů plochy. Obrázek oděvu je pouze ilustrační, nikoli přesný mockup
  zvoleného typu/střihu nebo skutečné polohy například kapsy.
- Do `trikonos-cart-v2` se uloží `kind: custom`, metadata uploadu, token, skutečná ID
  a umístění v mm. Nové obrázky se **neukládají jako data URL ani binární obsah**.
  Předchozí lokální demo drafty se zachovávají odděleně jako neověřené.
- `fileToken` platí 7 dní. Při vypršení/neplatnosti zůstává položka viditelná,
  ale košík není celý ověřený; UI vyzve k opětovnému nahrání v editoru a nahrazení
  staré položky. Podklad se bez původního souboru automaticky neobnovuje.
- Uploady zůstávají v backendovém media volume pod `designs/rok/měsíc/`.
  Zrušení nebo odebrání návrhu nevolá neexistující DELETE API. Opuštěné soubory
  starší 7 dní řeší existující `python manage.py cleanup_orphan_designs`;
  v produkci je nutné naplánovat pravidelný běh a zálohování. V této integraci
  se cleanup nespouští a cron se nenastavuje. URL podkladů jsou běžné media URL,
  nikoli soukromé odkazy s řízením přístupu.

### Administrace objednávek a nacenění

- `/admin/objednavky` načítá skutečný seznam, serverové hledání, filtry, řazení
  a stránkování. Filtry jsou v URL a zachovají se při návratu z detailu. Přehled
  čte posledních 5 skutečných objednávek; statistické karty jsou dál demo.
- `/admin/objednavky/:orderId` obsahuje zákazníka, adresy, položky včetně vlastních
  podkladů/geometrie, ceny a stavy. Staré `/admin/orders/:orderId` je kompatibilní
  vstup. Interní e-maily nyní vedou na českou cestu.
- Editovatelné objednávky dovolují změnit adresy, dopravu/dopravce, platbu a poznámku.
  Zákaznický kontakt je zde pouze pro čtení. Sledovací číslo lze opravit i po uzamčení.
- Ceny se zadávají v Kč (nejvýše 2 desetinná místa), API přijímá haléře. Prázdná
  cena položky je neoceněno, 0 je zdarma. Množství je 1–500. Doprava dovoluje
  ruční cenu a návrat k automatickému ceníku. Autoritativní součty vrací server.
- Změna ceny/množství/dopravy zruší potvrzení. Změna dopravce/doručení/platební
  metody přepočítá automatickou dopravu, ale zachová ruční override. Neexistující
  sazba vrátí chybu bez částečně uložené ceny či údajů.
- Potvrzení administrátorem vyvolá zákaznický e-mail, případně i s osobní zprávou;
  neznamená zákaznické schválení nabídky. Znovupotvrzení znovu posílá e-mail.
  `allowedTransitions` určuje nabízené stavové akce a `isLocked` uzamčení editace.
- Evidence plateb je nezávislá na stavu objednávky. Označení úhrady/refundace
  neprovádí bankovní operaci. Dobírkové PAID přejde podle backendu do výroby,
  aniž by tím byla platba označená za vybranou.
- Zápisy používají CSRF, bez optimistického úspěchu či automatického retry.
  Při nejasném výsledku se další změny zablokují do načtení aktuálního stavu;
  před opakováním potvrzení vždy zkontroluj, zda už nebylo přijato. Odpovědi admin
  objednávek mají `no-store`, jejich query cache se odstraňuje při odhlášení.
- Založení nové ruční objednávky a editace geometrie zatím nejsou napojené.
  Výrobu a expedici popisuje následující část. Podklady jsou existující
  media odkazy, nikoli nové privátní úložiště. Skutečné SMTP je nutné ověřit před produkcí.
- `tests/admin-orders.spec.ts` ověřuje workflow ve stavovém mock API; reálné objednávky
  nemění. Živý auth test čte skutečný seznam a detail jen pokud nějaká objednávka existuje.

### Výroba, expedice a tisk

- `/admin/vyroba` používá existující souhrn oděvů a seznam podkladů. Oběma
  požadavkům vždy předává stejný explicitní filtr stavů (výchozí PAID,PROCESSING)
  a data vytvoření. Tisková plocha se vztahuje jen na podklady. Datum/ID se validují
  na frontendu, neplatné filtry se na backend neposílají.
- Seznam podkladů podle kontraktu nemá počty, x/y ani ID objednávky. Řádek proto
  vede do hledání objednávky podle čísla. Kompletní data jsou v existujícím výrobním
  listu `/admin/objednavky/:orderId/tisk`, který se tiskne přes browser. Náhled
  podkladů není fyzický tisk 1:1; před tiskem ověř načtení obrázků a rozměry.
- V detailu objednávky je expedice: založení zásilky Packeta, skutečná hmotnost
  (kg, 3 desetinná místa), PDF štítek, ruční kontrola u Packety, dopředná evidence
  stavu zásilky a přeposlání e-mailů po potvrzení. Konfiguraci Packety musí mít
  připravenou backend; ostatní dopravci tímto API zásilky nezakládají.
- UI nabízí založení jen pro oceněnou objednávku ve výrobě a podporované doručení.
  Backend předává Packetě jméno/firmu zákazníka místo odlišného příjemce: pokud se
  liší od doručovací adresy, UI vytvoření zablokuje. Řešením je operátor u dopravce
  nebo změna od vlastníka backendu, nikoli doprogramování nové feature zde.
- **Nejisté vytvoření zásilky neopakuj naslepo.** Existující backend nemá spolehlivou
  idempotenci při timeoutu. Před POST se uloží pouze UUID objednávky a čas do klíče
  `trikonos-shipment-attempt-v1:<id>` v localStorage. Po síti/5xx zůstává marker
  i po reloadu a odhlášení. Prázdné ID v detailu neprokazuje, že nic nevzniklo.
  Nový pokus povol až po ověření přímo u Packety. Bez dostupného úložiště se požadavek
  neodešle. Ochrana není globální mezi zařízeními; operátoři se musí koordinovat.
- PDF se stáhne přes generovaný klient s cookies jako Blob, nikoli přes FE proxy.
  Stažení štítku může posunout stav na LABEL_PRINTED; GET synchronizace také zapisuje
  stav. Proto se obě akce spouštějí jen ručně, bez retry, pollingu nebo refetch na focus.
  Stav zásilky nemění sám stav objednávky či platby. E-maily používají aktuální data.
- Backend jsme funkčně nerozšiřovali: pouze správný PDF typ v OpenAPI a no-store
  u výrobních odpovědí. Nejsou přidané endpointy, serverové PDF ani soukromé úložiště.
- `tests/production-shipping.spec.ts` používá mock Packetu/PDF a nic u dopravce
  skutečně nezakládá. Živý auth test pouze čte výrobní přehled a případný existující list.

### Zákazníci a souhlasy

- `/admin/klienti` používá skutečný seznam se serverovým hledáním podle kontaktu
  a firmy, filtrem marketingového souhlasu, řazením a stránkováním. URL uchovává
  filtry při návratu z `/admin/klienti/:customerId`.
- Detail dovoluje upravit kontakt, firmu, poznámku a aktuální souhlas přes existující
  PATCH se CSRF. Změna e-mailu a souhlasu vyžaduje potvrzení; konflikt `EMAIL_TAKEN`
  zachovává vyplněný formulář. Při nejasném výsledku načti aktuální stav před dalším
  zápisem. Nové údaje se projeví také na kontaktu/e-mailech existujících objednávek,
  nikoli na jejich uložených adresách a položkách.
- Historie v detailu ukazuje nejvýše 10 řádků z odpovědi backendu. API detailu vrací
  celou historii; úplný stránkovaný seznam otevři přes tlačítko do objednávek
  s `customer=<id>`. Z objednávky je dostupný odkaz zpět na profil.
- Součet známých cen zahrnuje i zrušené a nezaplacené objednávky, není to součet
  úhrad. Souhlas je jen aktuální bool, ne audit s datem/verzí či historií.
- CSV export po potvrzení stahuje e-maily všech právě souhlasících zákazníků,
  **bez ohledu na filtr seznamu**. Obsah zůstává pouze v krátkodobém Blob downloadu,
  ne v query cache ani browser storage; stažený soubor musí operátor chránit.
  CSV je přes generovaný klient s cookies a `Accept: */*`; širší Accept vyžaduje
  DRF vyjednávání HttpResponse downloadů (stejná drobná oprava platí pro PDF štítky).
- API nenabízí ruční vytvoření, sloučení ani mazání zákazníků; UI je nepředstírá.
  Zákaznické záznamy nejsou přihlašovací účty. Na backendu se měnilo pouze no-store
  a OpenAPI popis PATCH/CSV, ne funkce zákazníků.
- `tests/admin-customers.spec.ts` testuje zápisy a export jen ve stavovém mock API.
  Živý auth test seznam/profil pouze čte, neexportuje skutečné kontakty ani je nemění.

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
- Staré lokální demo číselníky se nečtou ani neimportují do DB. Staré volby vlastního
  potisku se používají už jen pro rozpoznání a zachování historických demo draftů.

### Přihlášení a session

Login v patičce i `/prihlaseni` používají stejný formulář a skutečné session API.
Přímé otevření `/admin/...` nejprve ověří `/auth/me`; anonymního uživatele pošle
na přihlášení a po úspěchu vrátí na původní administrační URL. Serverový výpadek
není považovaný za odhlášení a nabízí opakované ověření. Session se ověřuje také
po návratu na kartu a každou minutu, pokud je uživatel přihlášený.

Před loginem, logoutem, katalogovými zápisy i uploadem proběhne CSRF bootstrap. Token se po loginu obnoví,
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
- `/kosik` — lokální košík se serverovou validací katalogu i nových vlastních potisků
- `/pokladna` — zákazník, adresy, doprava, platba a odeslání (podmíněné schválenými podmínkami)
- `/objednavka` — potvrzení a zákaznický detail po objednání nebo z e-mailového odkazu
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
- `src/data/` — statický obsah, sezónní fotografie, galerie návrhů a staré volby pro rozpoznání demo draftů
- `src/cart/` — typy, validace a obnova lokálního rozpracovaného košíku
- `src/checkout/` — formulářové pomocné funkce, bezpečné opakování odeslání a dočasná session data
- `src/admin/catalog/` — správa skutečných motivů, variant a fotografií
- `src/admin/lookups/` — správa katalogových číselníků a přehled pevných velikostí
- `public/` — samostatné kopie potřebných obrázků z původního frontendu, včetně
  dokumentace jejich zdrojů

Výchozí obrázek úvodu je `background/varianta1.png`. Přepínač alternativních
pozadí je odstraněný. Fonty DM Sans a Manrope se načítají lokálně z balíčků
Fontsource; aplikace nepotřebuje Google Fonts. Živý katalog vyžaduje dostupné API.

## Záměrná omezení prototypu

- Na backend jsou napojené config, katalog a jeho číselníky, správa motivů/variant/fotografií,
  editor/upload vlastního potisku, validace košíku, checkout/potvrzení a session autentizace.
  Serverové ukládání košíku, online brána a výdejní místa zatím napojené nejsou;
  reálné odeslání UI blokuje do doplnění schválených podmínek.
- Rozpracovaný košík se ukládá do `localStorage` pod `trikonos-cart-v2`. Starý klíč
  `trikonos-react-dictionaries-v1` se již nepoužívá a jeho data se automaticky nepřenášejí.
- Nové podklady vlastního potisku jsou na backendu; prohlížeč ukládá jen metadata a token.
  Staré demo drafty mohou dosud obsahovat lokální obrázek. Při selhání úložiště aplikace
  zobrazí chybu a nepotvrdí změnu košíku.
- Obnova a změna hesla zatím nemají frontendové rozhraní.
- Statistiky a recenze jsou ukázkové; objednávky a zákazníci používají backend.
  Sezóny obsahují informační seznam.
- Vzhled byl laděn pro desktop. Mobilní rozložení není součástí této migrace.
- Je to vizuálně věrný přepis, nikoli garantovaná pixelová shoda každého stavu:
  formuláře, dialogy, tabulky a FAQ používají MUI a drobně se liší od nativního HTML.
