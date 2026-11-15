# Trikonos

Plán propojení aplikací: [Integrace frontendu a backendu](docs/integrace-frontend-backend.md).

## Start

docker compose -f docker-compose.dev.yaml up --build

## React frontend

Nová aplikace je ve složce [`frontend2`](frontend2/README.md) (Vite+, React,
TypeScript, MUI a Bun). Spuštění: v `frontend2` spusť `bun install` a `bun run dev`.
Konfiguraci, katalog a jeho číselníky načítá přímo z backendu přes
TanStack Query a klienta generovaného Orvalem. Obsah administrace a editor
vlastního potisku jsou zatím demo; přístup do administrace vyžaduje skutečné přihlášení.
Nastavení API a generování jsou v [návodu frontendu](frontend2/README.md#api-tanstack-query-a-orval).

## Vývoj v Dockeru (hot reload)

Z kořene repozitáře spusť:

```sh
docker compose -f docker-compose.dev.yaml up --build
```

- Frontend: `http://localhost:5173` — Vite+ / React s HMR.
- Backend: `http://localhost:8000` — Django s automatickým restartem.
- PostgreSQL běží jen uvnitř Docker sítě, MailHog se nespouští.

Zdrojové soubory z `frontend2/` a `backend/` jsou připojené do kontejnerů.
Frontend používá polling pro spolehlivé sledování souborů i na Docker Desktopu.
Linuxové `node_modules` jsou v odděleném volume; hostitelské se nepoužijí.
Při změně závislostí spusť příkaz znovu s `--build`; frontend při startu také
synchronizuje balíčky podle `bun.lock`. Jednotlivé aplikace na sobě nezávisí
a browser volá backend přímo na `http://localhost:8000`, bez frontendové proxy.
Pro session přihlašování používej frontend i backend přes `localhost`,
nikoli kombinaci `127.0.0.1` a `localhost`.

E-maily se vypisují do logu backendu. Není potřeba vytvářet `.env`.
Při startu se provedou migrace a naplní výchozí data včetně vývojového
administrátora `admin@trikonos.cz` s heslem `change-me`.
Konfigurace je určená pouze pro lokální vývoj, ne pro produkci.

Databáze a nahraná média zůstávají v Docker volumes i po zastavení:

```sh
docker compose -f docker-compose.dev.yaml down
```

## Produkční Docker Compose

Frontend se sestaví pomocí Bun/Vite+ a výsledné statické soubory servíruje
Nginx s podporou React rout. Produkční image neobsahuje Node.js ani vývojové
závislosti. Backend používá Gunicorn (ne Django `runserver`), PostgreSQL
a samostatný Nginx pro `/static/`, `/media/` a předávání požadavků do Gunicornu.
Frontend nemá žádný proxy endpoint do backendu a má oddělenou Docker síť.
V produkci nejsou připojené zdrojové soubory ani zapnutý hot reload.

### První spuštění

```sh
cp .env.example .env.production
```

V `.env.production` doplň **dva různé náhodné klíče** do `DJANGO_SECRET_KEY`
a `POSTGRES_PASSWORD` (např. pro každý zvlášť spusť `openssl rand -hex 32`)
a nastav `DJANGO_ALLOWED_HOSTS` na skutečnou doménu backendu bez `https://`.
Soubor se nesmí commitovat; Compose bez povinných hodnot odmítne start.

```sh
docker compose --env-file .env.production -f docker-compose.yaml up -d --build
```

- Frontend: `http://127.0.0.1:8080` (port lze změnit přes `FRONTEND_PORT`).
- Interní vstup backendu: `http://127.0.0.1:8000` (`BACKEND_PORT`).
- Databáze ani Gunicorn nejsou publikované přímo na hostitele.
- Migrace a `collectstatic` se spustí automaticky. **Demo seed se nespouští**
  a nevytváří se účet s výchozím heslem. První backendový účet založ příkazem:

```sh
docker compose --env-file .env.production -f docker-compose.yaml exec backend python manage.py createsuperuser
```

V `.env.production` nastav `VITE_API_BASE_URL` na veřejný HTTPS origin backendu
a `FRONTEND_ORIGINS` na veřejný HTTPS origin frontendu (viz `.env.example`).
API URL je součástí buildu frontendu, po změně je nutné image znovu sestavit.
Produkční Compose bez těchto hodnot odmítne start, aby frontend omylem
nevolal `localhost` na zařízení návštěvníka.
Přihlášení je ověřené lokálně mezi různými porty; produkční domény a HTTPS
cookies je před nasazením potřeba ověřit samostatně.

Obsah administrace a vlastní potisk stále používají testovací data. Login v patičce
a `/prihlaseni` používají skutečnou autentizaci backendu; `/admin` je chráněné.
Konfigurace, katalogové číselníky, kategorie i motivy se načítají ze skutečného API.
Přidání katalogové varianty do košíku zatím uloží jen lokální návrh; checkout
a serverové ověření celého košíku ještě nejsou dostupné.

### HTTPS a přístup z internetu

**Compose je připravený za důvěryhodnou HTTPS reverse proxy na hostiteli**
(např. Caddy/Nginx s certifikátem pro každou doménu). Veřejnou doménu frontendu
směruj na `127.0.0.1:8080`, doménu backendu na `127.0.0.1:8000` a zachovej
veřejnou hlavičku `Host`. HTTP na veřejné straně přesměruj na HTTPS.
TLS/certifikáty tato konfigurace sama nezajišťuje.

### Raspberry: Cloudflare Tunnel a automatické nasazení

Produkční Compose připojuje pouze frontend a backendový Nginx do existující
externí sítě `bajerlukascz_network` (lze změnit přes `CLOUDFLARE_NETWORK`).
Při nasazení na jiný server musí tato síť existovat. Databáze ani Gunicorn
do sdílené sítě připojené nejsou.

Lokálně spravovaný Cloudflare Tunnel má na Raspberry konfiguraci
`/srv/shared/projects/cloudflare/config.yml` a směruje:

- `trikonos.bajerlukas.cz` → `http://trikonos-frontend:80`
- `trikonos-be.bajerlukas.cz` → `http://trikonos-backend-proxy:80`

Cloudflare přistupuje přímo přes Docker síť, nikoli přes publikované loopback
porty. Do `DJANGO_ALLOWED_HOSTS` patří `trikonos-be.bajerlukas.cz`.

Workflow `.github/workflows/deploy.yml` se spouští po pushi do `main` nebo ručně
z GitHub Actions. Používá ARM64 self-hosted runner na Raspberry a stálý klon
`/srv/shared/projects/Trikonos`. Runner musí běžet pod uživatelem s přístupem
k tomuto adresáři a Dockeru. Další SSH klíče ani GitHub Secrets nejsou potřeba;
ke stažení kódu používá dočasný token poskytnutý GitHubem.

Produkční `.env.production` je jen ve stálém klonu na Raspberry, ignorovaný Gitem.
Workflow nečistí pracovní adresář: stáhne `main` pomocí fast-forward aktualizace,
sestaví image za běhu staré verze a pak spustí kontejnery s kontrolou healthchecků.
Verzované soubory na serveru neupravuj ručně; necommitnuté změny deploy zastaví.
Deploye se nesouběží. Neúspěšný build ponechá staré kontejnery běžet, ale chyba
při startu či migraci neprovádí automatický rollback.

Porty jsou záměrně publikované jen na loopbacku. Interní backendový Nginx
předpokládá předchozí ukončení TLS a vždy přepíše `X-Forwarded-Proto` na
`https`. **Nezveřejňuj tento interní HTTP listener přímo do internetu.**
Django ponechává `DEBUG=False`, secure cookies a HTTPS bezpečnostní nastavení;
backendové přihlašování proto používej přes veřejnou HTTPS doménu.

Bez konfigurace SMTP se e-maily zapisují pouze do logu. Pro skutečné odesílání
nastav `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` a příslušné
`EMAIL_*` hodnoty v `.env.production`.

### Zastavení a data

```sh
docker compose --env-file .env.production -f docker-compose.yaml down
```

Produkce používá vlastní Compose projekt `trikonos-production` a samostatné
volumes pro databázi, média a statické soubory. Vývojová a produkční data se
nesdílejí. `down` je ponechá; volba `down -v` by je odstranila. Vývoj a produkci
nelze současně publikovat na stejném portu backendu; případně změň produkční
`BACKEND_PORT`. Databázi a média v reálném nasazení pravidelně zálohuj.
