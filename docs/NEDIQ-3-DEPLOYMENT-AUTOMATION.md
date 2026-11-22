# Автоматично публикуване на NED-IQ v3

**Текущ операторски статус:** автоматичното публикуване остава изключено.
На 2026-11-22 `main` съдържа v3.0.2 (merge `7ff64e1`), но това не е
потвърдената публична версия.
На 2026-11-22 публичното `release.json` потвърди v3.0.1 с SHA
`61437737a6fe16a7721bbce63ad4bcc45f7922fd`; run `45032386755`
пренасочи 100% трафик към съответната ревизия. Предишният production-probe
е проверил ревизия с 0% трафик. Не включвай traffic promotion или промяна
на трафика без отделно одобрение; преди следваща операция провери статуса отново.

Задача → Codex → PR → Tests → одобрен Merge → Automatic deployment → Production verification.

`public-v3-candidate.yml` използва същите PR проверки върху точния commit от
`main`. Публикува образ с неизменяем SHA tag в съществуващия Artifact Registry
и внедрява по digest. Една обща concurrency група сериализира подготовката,
публикуването и rollback. Преди промяна на трафика скриптът сверява `main`,
текущия маршрут и готовността на новата ревизия. Изисква един предишен
обслужващ target на 100%. Отделният Pilot запазва своята услуга.

Новата ревизия се създава без трафик. Точният Cloud Run URL с tag
`release-check` обслужва само release metadata и изрично изброени статични
ресурси. Пробата не допуска API или вход през тагнатия адрес. След HTTP, SHA,
digest и проверка на статични ресурси production режимът превключва 100%
трафик и проверява `https://nediq.eu`. При провал връща записаната предишна
ревизия и проверява сайта, включително съвпадението с предишната видима версия.
При несъвпадение възстановяването се отчита като непотвърдено.
Проверките използват само публични четения.
Няма промени в DNS, IAM, Firestore Rules или документи и няма миграции.

## Подготовка за автономна работа

При всяка задача класифицирай обхвата като v2, v3 или общ код и започни от
актуалния `origin/main` в отделен клон. За обичайна нискорискова промяна
Copilot може да създаде PR и след успешни проверки да поиска merge чрез
удостоверена идентичност с нужните права. Провери точния head SHA, резултата
от задължителния GitHub check, ревютата и приложимите rulesets; използвай
проверка за очаквания head SHA при merge. Не използвай bypass или admin
override. Ако има конфликт, неуспешна проверка или блокиращо правило, спри.
Достъпът на текущата сесия не гарантира, че друга Copilot среда има същите
права. GitHub Actions `GITHUB_TOKEN` не е заместител на подходяща отделна
идентичност за този процес: събитията, причинени от него, по правило не
стартират нови workflow изпълнения. Не създавай и не съхранявай токени в кода.

Геометрия, разкрой, ценообразуване, Firebase, съхранение и други рискови или
неясни промени изискват Draft PR и изрично одобрение за конкретния PR преди
merge. Firebase правила и реални данни имат отделни ограничения. За v3
Cloud Run операциите и активирането на автоматизацията продължават да изискват
отделно операторско одобрение; одобрение на PR не ги разрешава.

Правилото за `main` при проверката на 2026-11-22 изисква PR и успешен
`Node 24 / unit, release, Chromium and diff`, но не изисква одобрение на
ревю. `public-v3` допуска само `main`, без задължителен reviewer. Това не
изпълнява изискването за одобрение на PR от раздела за активиране. Изборът на
правило за независимо ревю и неговото прилагане изискват решение на
собственика; задължителен Environment reviewer би спрял напълно автономното
публикуване до ръчно одобрение.

След включване push към `main` стартира проверките за точния `github.sha`;
неуспешните проверки спират candidate job. Преди promotion скриптът изисква
този SHA все още да е върхът на `main`. Concurrency не отменя работещ run,
но чакащи runs могат да бъдат заменени: не се гарантира публикуване на всеки
междинен commit. При различен commit със същата или по-ниска версия от
публичната, включително документационен push, production guard отказва
promotion. Самото задаване на variable не стартира workflow. При стойност
`1` автоматичният push workflow за Pages също се пропуска; legacy v2
публикуването трябва да се планира отделно.

Rollback е опит чрез shell trap след започнато promotion, а не гаранция при
загуба или принудително прекратяване на runner. Проверете реално връщане
само в отделно одобрен прозорец; mock тестовете не го доказват. След
одобрено публикуване сверявай резултата от workflow, публичните SHA/версия в
`release.json` и видимата версия на https://nediq.eu/. При непотвърден
rollback или health check спри и уведоми оператора.

### Read-only проверка преди активиране

При липса на Google Cloud CLI в текущата среда оператор с read-only достъп
може да изпълни следните команди, без промяна на настройките или трафика:

```sh
gcloud iam workload-identity-pools providers describe ned-iq-public-github \
  --project=kitchen-designer-9d437 --location=global \
  --workload-identity-pool=ned-iq-public-github \
  --format='yaml(disabled,attributeMapping,attributeCondition)'
gcloud iam service-accounts get-iam-policy \
  ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com \
  --project=kitchen-designer-9d437
gcloud artifacts repositories get-iam-policy nediq \
  --project=kitchen-designer-9d437 --location=europe-west1
gcloud run services get-iam-policy nediq-v3-public \
  --project=kitchen-designer-9d437 --region=europe-west1
gcloud iam service-accounts get-iam-policy \
  ned-iq-v3-public@kitchen-designer-9d437.iam.gserviceaccount.com \
  --project=kitchen-designer-9d437
gcloud run services describe nediq-v3-public \
  --project=kitchen-designer-9d437 --region=europe-west1 \
  --format='yaml(status.traffic,status.conditions,spec.template.spec.serviceAccountName)'
```

Свери provider-а за enabled и `push`/`workflow_dispatch`, без отслабване на
repository ID `1404199718`, `refs/heads/main`, `public-v3` и точния
`nedkoradev/kitchen-calculator/.github/workflows/public-v3-candidate.yml@refs/heads/main`
workflow ref. Свери необходимите IAM роли от следващия раздел, както и
наследени bindings, conditions и deny policies; отделните ресурсни политики
сами по себе си не доказват ефективни права. Свери и Cloud Run revision,
traffic и runtime акаунт с публичното `release.json`. Не споделяй ключове,
токени или други чувствителни стойности при докладването.

## Еднократно активиране

1. Изисквай успешни PR проверки и одобрение на `main` чрез GitHub branch
   protection или ruleset. `public-v3` Environment трябва да допуска само
   `main`. При постоянно изискване за Environment reviewer GitHub ще
   изисква ръчно одобрение и след merge.
2. В съществуващия WIF provider запази ограниченията за конкретния числов
   repository ID, `refs/heads/main`, environment `public-v3` и точния
   `workflow_ref` на `public-v3-candidate.yml@refs/heads/main`. Ако
   условието допуска само `workflow_dispatch`, добави `push` към допустимите
   `assertion.event_name` стойности при същите останали ограничения.
   Запази `roles/iam.workloadIdentityUser` върху deployer-а за съществуващия
   ограничен WIF principal. Запази environment variables
   `PUBLIC_V3_WIF_PROVIDER` и `PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT`.
3. Deployer `ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com`
   има нужда от `roles/artifactregistry.writer` върху repository `nediq`,
   `roles/run.developer` върху съществуващата услуга `nediq-v3-public` и
   `roles/iam.serviceAccountUser` върху runtime акаунта
   `ned-iq-v3-public@kitchen-designer-9d437.iam.gserviceaccount.com`.
   Production скриптът работи само със съществуващата услуга. Не изисква
   `run.services.create`, промени на IAM или достъп до данните за deployer-а.
   Runtime акаунтът запазва съществуващите Firebase Auth и Firestore права.
4. Остави `NEDIQ_V3_AUTO_DEPLOY` unset. Слей PR за подготовката със `[skip ci]` в merge commit-а след успешни PR проверки, за да запазиш Pages/Pilot при подготовката. След одобрен merge стартирай веднъж
   `production-probe` от `main`. Провери summary, Ready ревизията, tag
   endpoint-а и че 100% трафик остава на предишната ревизия. Реалното
   пренасочване и връщане трябва да се проверят в договорен прозорец преди
   да се счита автоматизацията за оперативно потвърдена.
5. Едва след проверката задай repository variable
   `NEDIQ_V3_AUTO_DEPLOY=1`. Следващият push в `main` ще публикува след
   успешни проверки. Същата настройка спира автоматичното Pages публикуване.
   Не използвай `[skip ci]` при merge, предназначен за v3 публикуване.

## Версия и възстановяване

PR CI сравнява v3 runtime файловете с точния base SHA и отказва еднаква или по-ниска v3 версия. Документация и тестове не изискват bump. В GitHub ruleset маркирай съществуващия job `Node 24 / unit, release, Chromium and diff` като задължителен за `main`.

Увеличавай patch версията в `release-candidate/release.mjs` за всяко
публикуване на v3 (minor/major при промяна на съвместимостта).
`release.json` съдържа версия, commit, digest, ревизия, UTC начало на
внедряването и успешен test run. GitHub Actions summary записва
публикуваната и предишната ревизия. Интерфейсът използва същата версия.
При повторно изпълнение за вече активния commit не се променя трафикът.

При инцидент изключи `NEDIQ_V3_AUTO_DEPLOY`, стартирай съществуващия
workflow с `mode=rollback` и въведи последната работеща точна ревизия
от summary. `rollback_revision` се валидира преди WIF удостоверяване и
отново в deploy скрипта; празна стойност или име извън формата
`nediq-v3-public-<suffix>` се отказва с конкретна грешка, преди заявка
към Cloud Run. Production и `production-probe` не изискват тази стойност.
Провери резултата и `https://nediq.eu`. Връщането сменя
само Cloud Run трафика. Публикуването към Pages е отделна операция.

## Първо управлявано внедряване

При активната ревизия от серията `00004` с 100% трафик скриптът записва
точното име на обслужващата Ready ревизия. Ако `release.json` върне 404,
версията се извлича от реално обслужваните HTTPS HTML заглавие и `appVersion`;
двата маркера трябва да съвпадат. Друга HTTP грешка, невалидни или
несъвпадащи метаданни спират внедряването. При работещ `release.json`
скриптът сверява и версията в HTML, и активната ревизия в Cloud Run.

При предходното издание публичната v3.0.0 беше заменена от кандидат v3.0.1.
Равна или
по-ниска версия се отказва и при 404. При вече обслужван същия commit и
digest операцията приключва без промяна на трафика. Новият digest остава с
0% трафик до проверките. След превключването видимата версия трябва да
съвпадне с новия `release.json`, иначе трафикът се връща към записаната
ревизия. `production-probe` проверява същата версия и запазва 100% от
трафика на предишната ревизия. Автоматизацията остава изключена до отделно
операторско потвърждение.
