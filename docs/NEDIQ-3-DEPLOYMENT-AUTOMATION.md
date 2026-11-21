# Автоматично публикуване на NED-IQ v3

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
ревизия и проверява сайта. Проверките използват само публични четения.
Няма промени в DNS, IAM, Firestore Rules или документи и няма миграции.

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

Увеличавай patch версията в `release-candidate/release.mjs` за всяко
публикуване на v3 (minor/major при промяна на съвместимостта).
`release.json` съдържа версия, commit, digest, ревизия, UTC начало на
внедряването и успешен test run. GitHub Actions summary записва
публикуваната и предишната ревизия. Интерфейсът използва същата версия.
При повторно изпълнение за вече активния commit не се променя трафикът.

При инцидент изключи `NEDIQ_V3_AUTO_DEPLOY`, стартирай съществуващия
workflow с `mode=rollback` и въведи последната работеща точна ревизия
от summary. Провери резултата и `https://nediq.eu`. Връщането сменя
само Cloud Run трафика. Публикуването към Pages е отделна операция.
