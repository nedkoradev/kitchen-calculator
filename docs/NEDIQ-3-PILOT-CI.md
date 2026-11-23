# Одобрени публикации на NED-IQ v3.0 Pilot

Workflow-ът **Deploy approved NED-IQ v3.0 pilot** приема само ръчно стартиране от `main` с пълния SHA на `main` в момента на стартиране. Изпълнява същите тестове като PR проверките. След успешно преминаване работата за Cloud Run чака независимо одобрение в GitHub Environment `pilot`. Ревюиращият сверява въведения SHA и резултатите. Публикациите са последователни. Нов PR, сливане и Pages публикация сами по себе си не стартират workflow-а.

## Еднократна настройка след отделно одобрение

1. В GitHub създай Environment `pilot`. Добави задължителен независим reviewer, включи **Prevent self-review**, забрани заобикаляне на защитите и разреши deployment само от branch `main`. Ако планът на GitHub не поддържа задължителни reviewers, остави WIF недостъпен. Включи преглед на промени по deployment workflow-а в защитите на `main`.
2. С операторски достъп до Cloud провери съществуващите услуга, runtime service account и хранилище. Активните API са Cloud Run, Artifact Registry, IAM, IAM Credentials и Security Token Service. След отделно одобрение изпълни командите за създаване на специална deploy идентичност и WIF. Вземи числовия ID на репозиторито с командата по-долу.

```bash
PROJECT=kitchen-designer-9d437
REGION=europe-west1
SERVICE=nediq-v3-pilot
REPOSITORY=nedkoradev/kitchen-calculator
POOL=nediq-pilot-github
PROVIDER=pilot-main
DEPLOYER="nediq-pilot-deployer@$PROJECT.iam.gserviceaccount.com"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
REPO_ID=$(gh api "repos/$REPOSITORY" --jq .id)
RUNTIME=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')
test -n "$RUNTIME"

gcloud iam service-accounts create nediq-pilot-deployer --project "$PROJECT"
gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT" --location global
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT" \
  --location global --workload-identity-pool "$POOL" --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping 'google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition "assertion.repository_id == '$REPO_ID' && assertion.ref == 'refs/heads/main' && assertion.environment == 'pilot' && assertion.event_name == 'workflow_dispatch' && assertion.workflow_ref == '$REPOSITORY/.github/workflows/pilot-deploy.yml@refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project "$PROJECT" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPO_ID"
gcloud artifacts repositories add-iam-policy-binding nediq --project "$PROJECT" --location "$REGION" \
  --member "serviceAccount:$DEPLOYER" --role roles/artifactregistry.writer
gcloud run services add-iam-policy-binding "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --member "serviceAccount:$DEPLOYER" --role roles/run.developer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project "$PROJECT" \
  --member "serviceAccount:$DEPLOYER" --role roles/iam.serviceAccountUser
```

При липсващи API командата за отделно одобреното им активиране е:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT"
```

Последното право е `actAs` за конкретната действаща runtime идентичност, необходимо при прилагане на Cloud Run ревизия с нея. Deploy идентичността няма пряк достъп до Firestore, Auth данни или Secret Manager. Не създавай JSON ключове. Ако някой API липсва, активирането му е отделно операторско действие.

3. Провери, че хранилището `nediq` използва неизменяеми тагове. Ако не ги използва, одобри промяната за **целия** Docker repository с неговите потребители, преди да изпълниш:

```bash
gcloud artifacts repositories update nediq --project "$PROJECT" --location "$REGION" --immutable-tags
```

4. Добави двете **Environment variables** в `pilot`, след като защитите от стъпка 1 са проверени. Стойностите не са тайни и са достъпни за job-а след допускане от средата.

| Променлива | Стойност |
| --- | --- |
| `PILOT_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/nediq-pilot-github/providers/pilot-main` |
| `PILOT_DEPLOY_SERVICE_ACCOUNT` | `nediq-pilot-deployer@kitchen-designer-9d437.iam.gserviceaccount.com` |

## Пускане и връщане

- В Actions избери workflow-а и branch `main`, подай одобрения пълен SHA и изчакай проверките. Независимият reviewer одобрява job-а `pilot` само за този SHA.
- Workflow-ът изгражда и тества Linux amd64 образ, качва неизменяем таг от SHA, run ID и номер на опита, намира digest и създава ревизия по digest без трафик. Всеки повторен опит изгражда и тества собствен образ, без да заменя стар таг. Прехвърля 100% трафик след `Ready` и повторна сверка на старата ревизия. Съществуващият runtime service account, променливи и тайни се наследяват. Услугата трябва да има точно една ревизия със 100% трафик преди пускане.
- В job summary са записани SHA, digest, кандидат, предходна ревизия и URL. При неуспех прегледай състоянието на услугата и запазения digest преди отделно одобрен повторен опит или възстановяване.
- Преди създаване на кандидата и непосредствено преди прехвърляне на трафика workflow-ът проверява текущия `main` чрез GitHub API; при несъвпадение или неуспешна проверка спира без промяна на трафика.
- След отделно одобрение за rollback върни **предходната проверена ревизия** от summary-а. Използвай точно нейното име.

```bash
gcloud run services update-traffic nediq-v3-pilot --project kitchen-designer-9d437 \
  --region europe-west1 --to-revisions "ПРЕДХОДНА_РЕВИЗИЯ=100"
gcloud run services describe nediq-v3-pilot --project kitchen-designer-9d437 \
  --region europe-west1 --format='json(status.traffic,status.url)'
```

Локалният тест замества `gcloud` и проверява отказа при грешна услуга или неготова ревизия и прехвърлянето след успех. Първото реално изпълнение изисква одобрена проверка на Environment, WIF и IAM. Публичната версия и Firestore правилата са извън този процес.
