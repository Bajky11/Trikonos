# Audit frontendu – 17. 11. 2026

Audit stavu po commitu `617193c`. Jde o kontrolu, nikoli implementaci oprav.

## Závěr

Hlavní dohodnuté funkce dostupného API jsou napojené. Frontend ale zatím není
připravený k bezvýhradnému produkčnímu předání. Nalezeno je pět konkrétních bodů:
ztráta identity nejistého pokusu ruční objednávky, mobilní navigace, úzké rozložení
administrace a dva problémy se zavádějícími údaji. Žádný z těchto bodů nevyžaduje
implementaci nové backendové funkce.

P1 = opravit před použitím dotčené cesty; P2 = dokončit před veřejným/provozním předáním.

## Nálezy

### A1 · P1 · Opakování ruční objednávky po 4xx zahodí původní pokus

- **Kde:** `frontend2/src/admin/orders/ManualOrderPage.tsx:42–85`, zejména `66–75`.
- **Chování:** nejistý uložený pokus se opakuje se stejným UUID, ale jakákoli
  odpověď `ApiError` pod 500 smaže záznam ze sessionStorage. Nerozlišuje se první
  jednoznačně odmítnuté založení od obnovení dřívějšího nejistého požadavku.
- **Dopad:** původní POST mohl úspěšně založit objednávku, pouze se ztratila jeho
  odpověď. Následné odmítnutí například kvůli CSRF není důkaz, že první objednávka
  nevznikla. UI přesto nabídne nový formulář a při jeho odeslání nové UUID;
  deduplikace podle původního UUID již nepomůže. Hrozí duplicitní objednávka/e-mail.
- **Reprodukce v Chromium s mock API:** uložit `kind: pending` pod
  `trikonos-admin-order-attempt-v1`, otevřít `/admin/objednavky/nova`, na opakovaný
  POST vrátit HTTP 403 a stisknout „Dokončit stejné založení“. Ověřený výsledek:
  storage záznam je `null` a znovu se zobrazí nadpis „Ruční objednávka“ s formulářem.
  Pro tuto reprodukci nebylo nutné skutečnou objednávku zakládat.
- **Náprava:** zachovat původní pokus/UUID při chybě opakování již nejistého pokusu;
  umožnit nové založení až po autoritativním ověření výsledku. Rozlišovat jistě
  odmítnutý první pokus a předchozí nejistý výsledek.
- **Test:** rozšířit `frontend2/tests/manual-order.spec.ts` o ztracenou odpověď →
  reload → 403/400 → zachované původní UUID → úspěšné dokončení téhož pokusu.
  Stávající test ověřuje ztracenou odpověď → úspěšné opakování, nikoli tento mezikrok.

### A2 · P1 · Na mobilu/tabletu je tlačítko košíku mimo obrazovku

- **Kde:** `frontend2/src/components/StoreLayout.tsx:73–107`,
  `frontend2/src/styles.css:72–116`.
- **Chování:** desktopová navigace je jediný nerozbalovací flex řádek s pevnými
  mezerami a nezalamovanými odkazy; nemá úzkou/mobilní variantu.
- **Dopad:** důležité ovládání nákupní cesty není v běžně viditelné části okna.
  Na tabletu může dokument nemít horizontální scroll, i když obsah pevné hlavičky
  přesahuje doprava; samotná kontrola `scrollWidth` proto nestačí.
- **Ověření v Chromium:** na `/tricka`, `/produkt/motiv-1` a `/kosik` při viewportu
  375 i 768 px je levý okraj košíku přibližně 809–810 px a pravý 853–854 px.
  Při 1440 px je košík v obrazovce. Produkt byl testovací fixture, nikoli živý záznam.
- **Náprava:** mobilní navigace, trvale dostupný košík a přizpůsobení nákupních
  formulářů/detailu úzkému viewportu. Nestačí skrýt horizontální přetečení.
- **Test:** viewporty 375/768 px, navigace a košík v obrazovce a skutečný průchod
  katalog → detail → košík → pokladna klávesnicí i dotykovým ovládáním.

### A3 · P2 · Administrace není použitelně přizpůsobená úzkému oknu

- **Kde:** `frontend2/src/styles.css:1460–1469`, `1509–1553`.
- **Chování:** sidebar má stále 240 px, pracovní plocha stejný levý offset a
  hlavička nerozbalovací řadu ovládání. Chybí šířkové breakpointy pro admin shell.
- **Ověření v Chromium:** `/admin` má při viewportu 375 px šířku dokumentu zhruba
  867 px; `/admin/objednavky/nova` zhruba 912 px. Při 768 px je to přibližně
  869/913 px. Na 1440 px tyto obrazovky přes dokument nepřetékaly.
- **Dopad:** horizontální posouvání celé aplikace a ovládání mimo viditelnou plochu.
  Dosavadní desktopové zaměření je v README přiznané; jde o zbývající dokončení,
  nikoli nečekanou regresi poslední integrace.
- **Náprava:** sbalitelný sidebar, zalamování hlavičky a lokální scroll širokých
  tabulek místo rozšíření celé stránky.
- **Test:** úzké viewporty pro přehled, detail objednávky, ruční formulář a číselníky.

### A4 · P2 · Banner slibuje dopravu zdarma nezávisle na skutečném ceníku

- **Kde:** `frontend2/src/components/StoreLayout.tsx:63–68`.
- **Chování:** text „Doprava od 2 kusů zdarma“ je pevný řetězec. Backend ale cenu
  dopravy vrací podle konfigurace dopravce, způsobu dopravy, množství a případné
  dobírky; UI nemá podklad, že tento slib platí pro každou dostupnou nabídku.
- **Dopad:** veřejný marketingový příslib může odporovat skutečnému součtu v pokladně.
  To, že cenový výpočet pokladny používá server, tento rozpor neřeší.
- **Náprava:** do schválení skutečných pravidel odstranit konkrétní slib nebo jej
  nahradit neutrálním textem. Nevymýšlet pravidlo výpočtu ve frontendu.
  Současně nechat schválit i sousední obecný text o vrácení do 14 dnů s ohledem
  na zakázkový potisk; nejde zde o právní posouzení platnosti tohoto tvrzení.
- **Test:** konfigurace s placenou dopravou pro dva kusy nesmí současně zobrazovat
  bezpodmínečný příslib dopravy zdarma.

### A5 · P2 · Dashboard míchá skutečné objednávky s fiktivními metrikami

- **Kde:** `frontend2/src/pages/AdminPage.tsx:112–132`, `160–163`.
- **Chování:** karty ukazují pevně 12 objednávek, 18 940 Kč tržeb, 5 klientů a
  3 docházející produkty. Vysvětlení, že jde o demo, je až pod celým obsahem;
  jednotlivé karty vypadají jako provozní statistiky nad skutečným seznamem objednávek.
- **Dopad:** operátor může považovat ukázkové údaje za reálné. Backendové agregace
  chybějí záměrně, ale nepravdivé hodnoty lze přestat ukazovat už nyní bez nového API.
- **Náprava:** karty skrýt nebo nahradit přímo viditelným stavem „Statistiky nejsou
  dostupné“. Skutečné metriky doplnit až s dohodnutou definicí a API.
- **Test:** nad reálným přehledem nesmí být neoznačená ukázková číselná hodnota.

## Rozsah a ověření

- Statická kontrola veřejných cest, košíku, checkoutu, vlastního potisku,
  zákaznického přístupu, účtů/hesel, katalogové správy a hlavních administračních
  workflow včetně souvisejících kontraktů a testů. Nejde o bezpečnostní certifikaci.
- Cílená browser kontrola veřejného shellu, katalogu/detailu/košíku a admin
  přehledu/ruční objednávky při 375, 768 a 1440 px. Nejde o plný vizuální audit
  každé obrazovky ve všech stavech ani o test skutečného iOS/Android zařízení.
- Browser reprodukce A1 proti mock API. Ostatní provozní zápisy ověřuje existující
  mock E2E sada, nikoli nově založené skutečné objednávky či účty.
- `bun run check`: 0 chyb, 6 již známých warnings v generovaných Orval typech.
- `bun run test`: 27/27 unit testů.
- `bun run build`: úspěch.
- `bun run test:e2e`: 46 úspěšných, 2 živé testy záměrně skipped bez env přepínačů.
- Následně `LIVE_API_TESTS=1 LIVE_AUTH_TESTS=1 bunx playwright test
  tests/api-live.spec.ts tests/auth-live.spec.ts`: 2/2 úspěšné. Tyto testy používají
  lokální login/logout, čtou API a neprovádějí nové provozní zápisy ani rozesílku.
- Backendové aplikační testy při tomto auditu znovu spuštěné nebyly; předchozí
  etapa eviduje 170 passed a 1 skipped. Aplikace se v tomto auditu neměnila.

Existující E2E pokrytí zahrnuje objednávky/ceny/platby, výrobu/expedici,
zákazníky/export, účty/hesla, motivy/fotografie/číselníky i veřejnou nákupní cestu.
Nejde tedy o chybějící testy celé administrace; konkrétní mezery jsou zejména
u opakovaných chyb obnovy a úzkých viewportů. `playwright.config.ts:6–10`
standardně používá pouze Chromium 1440×900. Firefox, WebKit, screen reader,
úplný keyboard audit a produkční domény tímto ověřené nejsou.

## Záměrná omezení, ne nové chyby

- Sezóny, galerie, FAQ a recenze mohou podle zadání zůstat v kódu. Je nutné schválit
  skutečný obsah před zveřejněním; jejich CMS není podmínkou této integrace.
- Doprava/slevy/Packeta nastavení jsou odložené na pokyn uživatele.
- Veřejná ČR objednávka, převod/dobírka, osobní odběr/adresa, lokální košík a PNG/JPG
  podklady odpovídají dohodnutému rozsahu. Online brána, veřejný widget výdejních míst,
  SVG/PDF a více podkladů nejsou omylem vynechané hotové funkce.
- Oprava potisku upravuje existující geometrii, nikoli soubor či počet umístění.
- Packeta je blokovaná pro odlišného příjemce, protože současný backend předává
  zákaznický kontakt. Nejasné vytvoření zásilky vyžaduje kontrolu u dopravce;
  místní marker není distribuovaný zámek mezi zařízeními.
- Veřejný checkout při nejistém pokusu úmyslně zachovává stejné UUID a blokuje
  košík. Trvalá chyba obnovení může vyžadovat podporu. Bez autoritativního ověření
  by automatické odemčení mohlo způsobit právě riziko popsané v A1.
- Aktivní barvy/střihy vlastního potisku nejsou omezené katalogovou variantou
  motivu: backend tento vztah pro custom položky nevyžaduje
  (`backend/orders/services.py:138–161`). Není doložená chyba kombinací.
- HTML `required` validace je legitimní ochrana formuláře; umístění submit
  tlačítka mimo fieldset samo o sobě neznamená nefunkční validaci.
- Galerie produktu používá modulo délky pro další snímek
  (`frontend2/src/pages/ProductPage.tsx:107–120`); domněnka trvalého zaseknutí
  pouze kvůli kratší galerii se nepotvrdila.
- Editor adres objednávky porovnává změněná pole a počáteční adresu předvyplňuje
  z objednávky. Samotný rozdíl mezi zákazníkem a příjemcem není důkaz přepsání adresy.

## Produkční podmínky mimo samotnou integraci FE

Před ostrým spuštěním stále zbývá schválit obchodní podmínky a nastavit
`SHOP_TERMS_URL`, ověřit doručování SMTP, skutečné HTTPS domény/CORS/CSRF/cookies,
produkční API URL při buildu a přístupnost médií i soukromých podkladů. Dále
redigovat tokeny v proxy/backend logách, ověřit zálohy a naplánovat úklid uploadů.
Výchozí nginx access log v `frontend2/nginx.conf` zde není přepsaný tak, aby
maskoval query uid/token; odstranění query ve FE neodstraní již přijatý HTTP log.
Jde o známé nasazovací podmínky, nikoli o výsledek produkčního ověření tohoto auditu.

## Doporučené pořadí dokončení

1. Opravit A1 a přidat regresní test před používáním ručního založení v provozu.
2. Opravit A2 a doplnit mobilní nákupní E2E; potom A3 pro admin na úzkých displejích.
3. Odstranit nepodložené sliby a fiktivní metriky (A4/A5).
4. Ověřit produkční podmínky a cíleně projít nákup i provoz na cílových zařízeních.

Z tohoto auditu nevznikl požadavek doprogramovávat odložené backendové features.
