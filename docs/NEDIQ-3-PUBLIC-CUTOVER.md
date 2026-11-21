# Подготовка за NED-IQ v3.0.0

Публичният режим използва съществуващия Dockerfile и Workspace UI. Pilot запазва отделната си услуга и разрешения UID. Публичният сървър проверява отнемането на Firebase токена, Google доставчика, потвърдения имейл, точния origin и съвпадението на UID с личната v3 база. Публичният режим се включва само изрично.

„Документи v2.95“ чете оригиналите без запис. Собственикът ползва личната си библиотека. Споделените бази се откриват чрез входящия индекс, а всяко четене проверява актуалния grant на собственика в същата транзакция. Viewer и editor могат да отворят разрешения източник. Записът създава личен v3 документ и не обновява споделения v2 оригинал. Стари шкафове без вграден каталог изискват избор на оригиналната база. Ако историческата база липсва, коректността на материалните индекси не може да се гарантира.

## Действия с операторски достъп

1. Настрой защитения GitHub Environment `public-v3` с независим reviewer и достъп само от `main`. Използвай отделен deployer `ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com` и WIF по [схемата за Pilot CI](NEDIQ-3-PILOT-CI.md), с точния repository ID, `refs/heads/main`, средата `public-v3`, `workflow_dispatch` и workflow ref `nedkoradev/kitchen-calculator/.github/workflows/public-v3-candidate.yml@refs/heads/main`. Използвай pool `ned-iq-public-github`. Задай Environment variables `PUBLIC_V3_WIF_PROVIDER` и `PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT`. За режима `image-only` deployer-ът има само федеративно удостоверяване и Artifact Registry Writer върху `nediq`. Хранилището трябва да използва неизменяеми тагове.
2. След като workflow-ът е наличен в `main`, стартирай `image-only`. Вземи адреса с digest от отчета и създай услугата еднократно с операторския си акаунт. Първата ревизия на Cloud Run получава 100% от **вътрешното** разпределение. `--ingress internal` и изискването за IAM вход ограничават достъпа. Не добавяй домейн или публичен invoker на този етап.

   ```bash
   PROJECT=kitchen-designer-9d437
   REGION=europe-west1
   SERVICE=nediq-v3-public
   RUNTIME="nediq-v3-public@$PROJECT.iam.gserviceaccount.com"
   DEPLOYER="ned-iq-public-deployer@$PROJECT.iam.gserviceaccount.com"
   # DIGEST_REF е пълният адрес на проверения образ с @sha256:… от GitHub.
   # FIREBASE_WEB_API_KEY е одобреният ключ за Firebase Web.
   gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
     --image "${DIGEST_REF:?}" --service-account "$RUNTIME" --ingress internal \
     --no-allow-unauthenticated \
     --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,NEDIQ_PUBLIC_ENABLED=1,NEDIQ_PUBLIC_ORIGIN=https://nediq.eu,NEDIQ_FIREBASE_AUTH_DOMAIN=$PROJECT.firebaseapp.com,NEDIQ_FIREBASE_WEB_API_KEY=${FIREBASE_WEB_API_KEY:?}"

   gcloud run services add-iam-policy-binding "$SERVICE" --project "$PROJECT" --region "$REGION" \
     --member "serviceAccount:$DEPLOYER" --role roles/run.developer
   gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project "$PROJECT" \
     --member "serviceAccount:$DEPLOYER" --role roles/iam.serviceAccountUser
   ```

   След потвърждение на правата върху конкретната услуга премахни широката проектна роля Cloud Run Admin от deployer-а. Остави Artifact Registry Writer за `nediq`, Cloud Run Developer за тази услуга и Service Account User само върху `nediq-v3-public` runtime акаунта.

   След това `candidate` обновява само тази съществуваща услуга и оставя новата ревизия с 0% трафик. Проверява вътрешния ingress, действащия IAM invoker check и точния runtime акаунт. Двата режима не променят DNS, Pages или Pilot.
3. В Firebase и Google OAuth потвърди `nediq.eu` като разрешен домейн и провери ограниченията на API ключа. Подготви Cloud Run маршрутизация, собственост на домейна и TLS. Създай проверен Firestore архив за v2 и v3 и изпитай възстановяването в отделна база. Локалните v2 чернови са на отделен формат. Запази копия от тях чрез v2 преди превключване.
4. Запиши текущите DNS записи и последния v2.95 build. Преди смяна на DNS изпитай публичната ревизия и входа с два отделни Google акаунта чрез контролиран достъп до целевия origin. Провери лични и споделени v2 документи, запис в собствената v3 библиотека, отказ за чужда база и възстановяване. При одобрен cutover прехвърли трафика към проверената ревизия и насочи DNS към готовия HTTPS маршрут.
5. При rollback възстанови предишните DNS записи и Pages конфигурацията. Запази v3 документите и черновите. v2.95 не чете v3 записи, затова преди cutover трябва да е изпитан и отделен начин за достъп или експорт на v3 работата след rollback. DNS връщането само не покрива тази проверка.

Подготовката не включва продукционен архив, DNS промяна или активиране на кандидата.
