# Подготовка за NED-IQ v3.0.0

Публичният режим използва съществуващия Dockerfile и Workspace UI. Pilot запазва отделната си услуга и разрешения UID. Публичният сървър проверява отнемането на Firebase токена, Google доставчика, потвърдения имейл, точния origin и съвпадението на UID с личната v3 база. Публичният режим се включва само изрично.

„Документи v2.95“ чете оригиналите без запис. Собственикът ползва личната си библиотека. Споделените бази се откриват чрез входящия индекс, а всяко четене проверява актуалния grant на собственика в същата транзакция. Viewer и editor могат да отворят разрешения източник. Записът създава личен v3 документ и не обновява споделения v2 оригинал. Стари шкафове без вграден каталог изискват избор на оригиналната база. Ако историческата база липсва, коректността на материалните индекси не може да се гарантира.

## Действия с операторски достъп

1. Настрой защитения GitHub Environment `public-v3` с независим reviewer и достъп само от `main`. Използвай отделен deployer `ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com` и WIF по [схемата за Pilot CI](NEDIQ-3-PILOT-CI.md), с точния repository ID, `refs/heads/main`, средата `public-v3`, `workflow_dispatch` и workflow ref `nedkoradev/kitchen-calculator/.github/workflows/public-v3-candidate.yml@refs/heads/main`. Използвай pool `ned-iq-public-github`. Задай Environment variables `PUBLIC_V3_WIF_PROVIDER` и `PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT`. За режима `image-only` deployer-ът има само федеративно удостоверяване и Artifact Registry Writer върху `nediq`. Хранилището трябва да използва неизменяеми тагове.
2. За първоначално създаване задай GitHub Environment secret `PUBLIC_V3_FIREBASE_WEB_API_KEY` с одобрения Firebase Web ключ и стартирай `candidate` от `main`. Workflow-ът използва Cloud Run API за създаване само когато успешната проверка за наличие върне празен резултат. При съществуваща услуга проверява частния достъп и внедрява ревизия с 0% трафик. Първата ревизия може да получи 100% от **вътрешното** разпределение. И в двата случая няма промяна на DNS, домейни или IAM политика. Резюмето съдържа ревизията и вътрешния URL.

   Използвай runtime акаунта `ned-iq-v3-public@kitchen-designer-9d437.iam.gserviceaccount.com`. Deployer-ът има нужда от `iam.serviceAccounts.actAs` точно върху него. Ако това право липсва, операторът може да го предостави така:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding ned-iq-v3-public@kitchen-designer-9d437.iam.gserviceaccount.com \
     --project kitchen-designer-9d437 \
     --member serviceAccount:ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com \
     --role roles/iam.serviceAccountUser
   ```

   За първоначално създаване е нужно `run.services.create` върху родителския проект. Дай го временно чрез ограничена роля, ако текущият достъп го няма, и го отнеми след създаване. За проверките остави `run.services.list` на проектно ниво и право за четене на IAM политиката на конкретната услуга. За следващи обновявания използвай Cloud Run Developer върху `nediq-v3-public`. Отнеми широката проектна Cloud Run Admin роля след проверка на ограничения достъп. Workflow-ът проверява ефективното `actAs` и правата за създаване или обновяване преди опита за deploy. Проверката използва същата WIF идентичност. Workflow-ът не променя ролите. Docker тестът стартира публичния режим с изолирана мрежа и проверява HTML, основни ресурси и отказ без вход. Реалният Google вход и Firestore остават проверки от разрешен вътрешен клиент.
3. В Firebase и Google OAuth потвърди `nediq.eu` като разрешен домейн и провери ограниченията на API ключа. Подготви Cloud Run маршрутизация, собственост на домейна и TLS. Създай проверен Firestore архив за v2 и v3 и изпитай възстановяването в отделна база. Локалните v2 чернови са на отделен формат. Запази копия от тях чрез v2 преди превключване.
4. Запиши текущите DNS записи и последния v2.95 build. Преди смяна на DNS изпитай публичната ревизия и входа с два отделни Google акаунта чрез контролиран достъп до целевия origin. Провери лични и споделени v2 документи, запис в собствената v3 библиотека, отказ за чужда база и възстановяване. При одобрен cutover прехвърли трафика към проверената ревизия и насочи DNS към готовия HTTPS маршрут.
5. При rollback възстанови предишните DNS записи и Pages конфигурацията. Запази v3 документите и черновите. v2.95 не чете v3 записи, затова преди cutover трябва да е изпитан и отделен начин за достъп или експорт на v3 работата след rollback. DNS връщането само не покрива тази проверка.

Подготовката не включва продукционен архив, DNS промяна или активиране на кандидата.

## Защитен тест от Chrome с реален Google вход

Локалният маршрут изпълнява същия v3 интерфейс и API с отделен Firebase Authentication проект и локален Firestore Emulator. Подходящ е за функционални тестове със синтетични данни. Проверката на внедрената Cloud Run ревизия остава отделна и изисква разрешен вътрешен маршрут. Cloud Run, DNS, Pages и продукционният Firestore не участват в локалния тест.

1. В отделен Firebase проект създай Web App. В **Authentication → Sign-in method** включи Google и избери support email. В **Authentication → Settings → Authorized domains** добави `localhost`. Използвай Project ID и Web API Key от тази Web App. Тестовият оператор има нужда от Firebase Authentication Viewer само в тестовия проект за проверка на отнети токени. На компютъра изпълни `gcloud auth application-default login` с този операторски акаунт. В Chrome използвай отделни тестови Google потребители.
2. От корена на хранилището изпълни `npm ci`. В първи терминал стартирай Firestore Emulator (необходима е Java 21).

   ```bash
   scratch=$(mktemp -d)
   trap 'rm -rf -- "$scratch"' EXIT
   node rollout-preflight/composite-rules.mjs > "$scratch/workspace-v3.rules"
   cp tests/emulator/workspace-v3.json "$scratch/firebase.json"
   ./node_modules/.bin/firebase emulators:start --only firestore \
     --project demo-nediq-v3-release --config "$scratch/firebase.json"
   ```

3. Във втори терминал стартирай приложението, като замениш примерните стойности. Отвори [http://localhost:8053/](http://localhost:8053/) в Chrome. Двата локални процеса трябва да останат стартирани. Използвай URL с `localhost`, за да съвпадне с разрешения origin.

   ```bash
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8090 \
   NEDIQ_TEST_AUTH_PROJECT='your-test-project-id' \
   NEDIQ_TEST_FIREBASE_WEB_API_KEY='your-test-web-api-key' \
   node rollout-preflight/local-google.mjs
   ```

4. Провери вход, обновяване на страницата и изход в Chrome. С два отделни профила запази синтетичен шкаф или проект с първия акаунт и провери, че вторият не го вижда. Провери папки, дублиране, отваряне след запис, материали, кантове, разкрой и мобилен изглед. За проверка на v2.95 съвместимостта подготви синтетични v2 записи в същия емулатор с UID на тестовия потребител от тестовия Firebase проект.

## Директен достъп през Cloud Run

Публичният v3 режим приема точните HTTPS адреси `nediq.eu`,
`nediq-v3-public-579302190437.europe-west1.run.app` и
`nediq-v3-public-inu5wh5ola-ew.a.run.app`. Добави всеки използван hostname
във Firebase Authentication → Settings → Authorized domains и провери
ограниченията на Firebase Web API ключа. API заявките приемат origin само
от същия разрешен хост. Cloud Run URL за друг проект, друга услуга или
tagged ревизия не получава достъп до работното пространство.

Workflow режимът `candidate` е за частна услуга. За вече публична услуга,
след одобрено сливане, операторът може да изгради проверения образ чрез
`image-only` и да създаде ревизия без трафик, използвайки immutable
image ref от GitHub Actions. Запази текущото разпределение на трафика за
rollback и настройките за ingress, Firebase и runtime акаунта. Временно
връщане на ingress към private само за изпълнение на workflow не е нужно.

### Диагностика на Google входа

v3 използва Firebase Auth compat с `signInWithPopup` и `authDomain`
`kitchen-designer-9d437.firebaseapp.com`. Няма автоматичен redirect fallback.
След вход браузърът изпраща Firebase ID token към `/staging-api`. Сървърът
проверява отнемането на токена, Google provider, потвърдения имейл и UID.
Ограничението `NEDIQ_PILOT_UID` важи за отделния Pilot.

Във Firebase Console избери `kitchen-designer-9d437`. В **Authentication →
Sign-in method** провери, че Google е активен. В **Authentication → Settings →
Authorized domains** провери точния хост от адресната лента, например
`nediq-v3-public-579302190437.europe-west1.run.app`, без схема или път.
Добавяй само официалния Cloud Run адрес, на който ще тестваш. При персонализиран
Google OAuth клиент провери, че е разрешен redirect URI
`https://kitchen-designer-9d437.firebaseapp.com/__/auth/handler`. Ако Web API
ключът има HTTP referrer ограничения, провери дали допускат тестовия хост.

Ако браузърът откаже сесийното хранилище, приложението опитва Firebase сесия
в паметта до презареждане. Това не заобикаля браузърните ограничения на Google
popup. Видимото съобщение различава отказан домейн, блокиран popup или storage
и потвърден Google вход, последван от отказ или недостъпност на API.

При проверката на 21.11.2026 г. Firebase Identity Toolkit върна разрешените
домейни на проекта с HTTP 200. Списъкът съдържаше `nediq.eu` и регионалния
адрес на Pilot, но липсваха двата адреса на `nediq-v3-public`. За тест на
регионалния публичен URL добави само него. Провери в чист Chrome профил.
