# Зависимости на NED-IQ v3.0

## Обхват

- Node.js 24.22.3 е фиксиран в `.nvmrc`, PR CI и двата Docker етапа. Публичният Pages workflow запазва предишната си конфигурация.
- Cloud Run инсталира `firebase@13.4.0` и `firebase-admin@13.6.0` с `npm ci --omit=dev` от общия lockfile. Браузърните Firebase Auth compat ресурси на v3 се сервират от този SDK. Отделният gstatic импорт на v2 в `cloud.js` запазва версията си.
- Firebase SDK 13.4.0 все още фиксира `@grpc/grpc-js@1.9.16` в `@firebase/firestore`. Override само за тази връзка задава `1.14.7`. Премахни override след обновяване на upstream фиксираната версия и повторен одит.
- `firebase-tools@15.37.0` използва `tar@7.5.23` и `superstatic@10.0.0`, който декларира Node 24. `@firebase/rules-unit-testing@6.0.0` поддържа Firebase SDK 13. CLI и емулаторните тестови пакети не влизат в крайния образ. Firebase CLI 15 изисква Java 21 или по-нова версия за Firestore Emulator. CI зарежда Temurin 21 преди емулаторните тестове.

## SheetJS и Salex

SheetJS 0.20.3 се сервира на `/staging-sdk/xlsx-0.20.3.min.js` само от хоста за активирания v3 интерфейс. Статичният `index.html` и Pages cache остават идентични с v2.95. Chromium проверката изтегля реален Salex XLSX от v3 екрана за разкрой и проверява листа `RIK_order`, колоните и числовите размери.

Браузърният файл и Apache-2.0 лицензът са извлечени от `@e965/xlsx@0.20.3`, npm препубликация на SheetJS Community Edition. Използвана е препубликацията поради недостъпен официален CDN в средата на проверката. SHA-512 на архива е сверена с npm `dist.integrity`. SHA-256 на локалния JS е `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`. При следващо обновяване предпочети официален upstream артефакт и повтори браузърната проверка.

## Остатъчен риск

| Обхват | Moderate | High | Critical |
|---|---:|---:|---:|
| npm дърво с разработка и CI | 19 | 0 | 0 |
| npm продукционно дърво | 8 | 0 | 0 |

Продукционните записи са за `uuid@9.0.1` и пакети, които го включват чрез Firebase Admin и Google Cloud библиотеките. Находката засяга варианти v3/v5/v6 с предоставен буфер. В собствения код на NED-IQ няма директна употреба на тези варианти. Обновяването на Firebase Admin е отделна промяна с тестове за вход и запис. [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)

В инструментите има допълнителни находки за `glob`, `minimatch` и `@opentelemetry/core`, както и наследени записи, включително от `uuid`. Те засягат обработка на glob шаблони, прекратяване на обхождане и обработка на телеметричен контекст. Тези версии са в тестовото дърво и не присъстват в Cloud Run образа. [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) · [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) · [OpenTelemetry](https://github.com/advisories/GHSA-8988-4f7v-96qf)

Одитът покрива npm зависимостите. Състоянието на пакетите на базовия Debian образ се проверява отделно. Повтори одита на образа за конкретния commit преди публично пускане.

## Сливане без публикуване

Промяната на общия XLSX ресурс и bump-ът до v2.96 са извадени от PR #138. `index.html`, `sw.js`, `_data/version.json` и Pages workflow са идентични с `main`. Нормален push в `main` все пак може да задейства Pages и Pilot. След успешно PR CI и одобрение използвай squash merge със суфикс `[skip ci]` в заглавието на **merge commit-а**, за да се пропуснат двата push workflow-а. Остави PR commit-ите без този маркер, за да се изпълнят проверките им. След сливането провери GitHub Actions за merge SHA и потвърди, че публичният `release.json` запазва v2.95 и предишната ревизия. Внедряването на v3 е отделна стъпка.
