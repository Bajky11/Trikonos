# Trikonos

## React frontend

Nová aplikace je ve složce [`frontend2`](frontend2/README.md) (Vite+, React,
TypeScript, MUI a Bun). Spuštění: v `frontend2` spusť `bun install` a `bun run dev`.
Obsahuje pouze testovací data, backend pro její provoz není potřeba.

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
a frontend nevolá backend.

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

Frontend stále zobrazuje pouze testovací data a jeho Login otevírá demo
administraci, nikoli skutečnou autentizaci backendu.

### HTTPS a přístup z internetu

**Compose je připravený za důvěryhodnou HTTPS reverse proxy na hostiteli**
(např. Caddy/Nginx s certifikátem pro každou doménu). Veřejnou doménu frontendu
směruj na `127.0.0.1:8080`, doménu backendu na `127.0.0.1:8000` a zachovej
veřejnou hlavičku `Host`. HTTP na veřejné straně přesměruj na HTTPS.
TLS/certifikáty tato konfigurace sama nezajišťuje.

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
