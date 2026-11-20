# NED-IQ 3.0 · Финален пилот

Целевият Firebase проект е `kitchen-designer-9d437`, база `(default)` в `eur3`. Cloud Run е в `europe-west1`. Публичният `index.html`, v2.95, Pages workflow, worker и действащият rules файл остават неизменени. Пилотът се обслужва на отделен Cloud Run HTTPS origin. Служебният endpoint е изключен по подразбиране, а `/` насочва към [публикуваната v2.95 в GitHub Pages](https://nedkoradev.github.io/kitchen-calculator/). При включване пилотът генерира отделна сцена, без legacy cloud, нулиране или service worker. HTML и HTTP отговори са `no-store`.

## Одобрение 1 · Точен UID и експорт

Собственикът проверява своя UID в Firebase Authentication → Users за собствения Google вход. Сверява го лично с акаунта и го съхранява в частен файл `{"ownerUid":"…"}` извън репото. Не ползвай предположение по имейл, не искай токен и не записвай UID в Issue или PR. На Cloud Run UID се подава от Secret Manager на runtime идентичността и не се връща в HTML. Провереният Google токен трябва да има същия UID, `email_verified: true` и provider `google.com`. Проверяват се отнети токени и точният scope на собственик и актьор.

`node pilot/operator.mjs plan-export /private/uid.json /private/export-plan.json` е локална операция. Одобри точния върнат SHA-256 и обхвата. Едва след това използвай оператор с временно разрешен read-only достъп към базата и одобрените ADC:

```bash
GOOGLE_CLOUD_PROJECT=kitchen-designer-9d437 NEDIQ_APPROVED_EXPORT_SHA256="$APPROVED_EXPORT_SHA" \
  node pilot/operator.mjs execute-export /private/export-plan.json /private/pilot.enc 3< /private/passphrase-fd
node rollout-preflight/backup.mjs verify /private/pilot.enc 3< /private/passphrase-fd
sha256sum /private/pilot.enc
```

Файловият дескриптор 3 може да е процесен канал от мениджър на пароли. Ако използваш временен файл, дръж го на частен криптиран диск с права 0600 и приложи одобрената си политика за изтриване. Експортът чете единствено `users/{uid}/v2_projects`, `v2_cabinets`, `materials` и броя на записите в `access_grants` за същия собственик в една read-only транзакция. Има лимит 500 записа на колекция. Насрещни споделени профили и имейли не се извличат. Съществуващ shared grant блокира този миграционен маршрут до отделен преглед. Legacy черновите са локални. Предостави копия от устройството или потвърди изрично, че няма чернови. Историческият каталог се предоставя отделно за всеки шкаф, когато липсва в записа.

## Одобрение 2 · Cloud Run и IAM

Вземи точния reviewed commit и образ от него. Провери размера на образа и регистъра. След изрично одобрение за ресурси изпълни:

```bash
PROJECT=kitchen-designer-9d437
REGION=europe-west1
SERVICE=nediq-v3-pilot
RUNTIME=nediq-pilot-runtime
gcloud iam service-accounts create "$RUNTIME" --project "$PROJECT"
gcloud iam roles create NediqPilotRuntime --project "$PROJECT" --title='NED-IQ Pilot Runtime' \
  --permissions=datastore.databases.get,datastore.databases.getMetadata,datastore.entities.get,datastore.entities.list,datastore.entities.create,datastore.entities.update,datastore.entities.delete,firebaseauth.users.get
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$RUNTIME@$PROJECT.iam.gserviceaccount.com" \
  --role="projects/$PROJECT/roles/NediqPilotRuntime"
gcloud run deploy "$SERVICE" --source . --project "$PROJECT" --region "$REGION" \
  --service-account "$RUNTIME@$PROJECT.iam.gserviceaccount.com" --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --concurrency 8 --timeout 30s --cpu 1 --memory 512Mi \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,NEDIQ_PILOT_ENABLED=0"
```

Одобри инфраструктурата и runtime ролята отделно. Firestore IAM в тази база не ограничава Admin SDK на ниво колекция. Пилотният код ограничава scope и транзакциите. Изпитай ролята и отнемането ѝ преди включване. Provisioning/deploy идентичността е отделна и не се дава на runtime. Предостави само `roles/secretmanager.secretAccessor` за конкретната UID secret версия на runtime, без JSON ключове. Firebase web API key и потвърденият `kitchen-designer-9d437.firebaseapp.com` auth domain са browser конфигурация, подавана отвън. Проверявай ограниченията на този API key и Google OAuth Authorized Domains в конзолата. Добави точния `.run.app` hostname за Google popup след одобрение.

HTTP лимитът е 900 KB, транзакционният 800 KB. След една проверка на токена, отнемането и пилотната самоличност backend допуска до 120 заявки на минута за пилотния UID на инстанция. Провери общия лимит с две инстанции и одобрени бюджети. Защитата не е глобална квота. Наблюдавай 401/403, конфликт, 5xx, p95, разходи и висящ журнал. Приложението не логва тела, токени, имейли, UID или съдържание на документи. Управляваните Cloud Run access logs могат да съдържат IP адреси и URL. Одобри ограничен достъп, задържане и при нужда изключване на тези записи преди реален вход.

## Одобрение 3 · Rules

`pilot/firestore-v3.patch` е точният diff спрямо репозиториалния файл. `node rollout-preflight/composite-rules.mjs > /private/firestore-composite.rules` строи същия файл, върху който работят authenticated тестовете. Изискай частно потвърдено копие на публикуваните правила. При разлика от Git спри и повтори прегледа на съставния файл. Запази правилата за rollback. След отделно разрешение подготви частен Firebase CLI config, който сочи към проверения composite, и изпълни `firebase deploy --only firestore:rules --project kitchen-designer-9d437 --config /private/firebase-rules.json`. Тази команда не е част от CI.

## Одобрение 4 · Dry-run и миграция

В частния каталог подай на `pilot/operator.mjs dry-run` JSON с `archive` като път до шифрования файл и `review` с `catalogs` (map по legacy ID), `drafts` и `confirmNoDrafts: true` само след проверка. Подай fd 3. Успешният dry-run извежда само бройки и SHA. При блокер може да се предостави път за шифрован диагностичен отчет. Потвърди ID mapping, бройки, права, геометрия, разкрой, цени и чернови преди отделното одобрение. Оригиналните v2 записи остават. Възстановяването на конвертирана локална чернова в активен браузър изисква проверка на конкретното копие и изричен избор на потребителя. Операторът не презаписва браузърното хранилище. Самостоятелните legacy бази и предпочитания остават в архива и във v2.95. Вносът използва каталога и настройките на всеки документ, а не създава отделна v3 библиотека от материални бази.

След одобрение изпълни `GOOGLE_CLOUD_PROJECT=kitchen-designer-9d437 NEDIQ_APPROVED_MIGRATION_SHA256="$APPROVED_MIGRATION_SHA" node pilot/operator.mjs execute-migration /private/review.json 3< /private/passphrase-fd`. Вносът е атомарен до 150 документа и 7 MB вход, отказва непразна v3 библиотека и запазва разписка. Повторение на същия reviewed SHA връща предишния резултат. Съществуващите v2 данни и правилата не се променят.

## Одобрение 5 · Пилотно включване и rollback

Изпълни `node pilot/preflight.mjs /private/evidence.json` с `approvedRulesFile`, `commit`, `testedCommit`, `fallbackCommit`, `backupSha256`, `migrationSha256`, `unresolvedBlockers: 0` и потвърдените булеви полета `rollbackRehearsed`, `backupVerified`, `googleUidVerifiedPrivately`, `iamAndBudgetReviewed` и `originReviewed`. Резултатът е проверка на локалните доказателства. Той не дава разрешение за активация.

След изрично одобрение за пилот обнови Cloud Run revision с `NEDIQ_PILOT_ENABLED=1`, `NEDIQ_PILOT_ORIGIN=<точния HTTPS origin>`, `NEDIQ_FIREBASE_AUTH_DOMAIN=kitchen-designer-9d437.firebaseapp.com` и одобрения web API key през частна env конфигурация. Подай `NEDIQ_PILOT_UID` като `--update-secrets NEDIQ_PILOT_UID=<secret>:<version>`. Свери отказа за друг акаунт и знак v3.0 след проверения Google вход. Публичният Pages сайт остава v2.95. Задължителен ръчен go/no-go след одобрение е успешен Google OAuth popup на действителния Cloud Run origin с пилотния акаунт, отказ за друг акаунт и проверка на журнал, отваряне, запис и възстановяване върху одобрения пилот. При неуспех спри включването. Зеленият CI покрива изключения контейнер и локалния Auth Emulator. Той не потвърждава продукционния Google OAuth. Публично Pages превключване остава отделно решение.

След отделно одобрение използвай частен env YAML с вече описаните настройки, без UID, и конкретна тайна версия. Командата е:

```bash
gcloud run services update nediq-v3-pilot --project kitchen-designer-9d437 --region europe-west1 \
  --env-vars-file /private/pilot-active.env.yaml --update-secrets "NEDIQ_PILOT_UID=$PILOT_SECRET_NAME:$PILOT_SECRET_VERSION"
```

Включи `GOOGLE_CLOUD_PROJECT: kitchen-designer-9d437` в този файл. При устойчива грешка върни трафика към проверената изключена revision. Утвърденият Docker образ също може да се подаде с `--image` вместо `--source`, за да се публикува точно провереният digest.

Rollback е `gcloud run services update nediq-v3-pilot --project kitchen-designer-9d437 --region europe-west1 --update-env-vars NEDIQ_PILOT_ENABLED=0` след разрешение. Провери, че API връща 503 и `/` насочва към v2.95. Не изтривай v3 данни; архивирай новите документи, разписки и чернови за сверяване. Връщане на правила изисква отделно одобрение и одобрения оригинален файл. Реалният UID, OAuth Authorized Domains, IAM и частните архиви са непроверени до тези разрешения.
