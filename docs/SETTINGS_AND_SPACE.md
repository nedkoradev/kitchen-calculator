# Настройки, GitHub пространство и repo текстури

Един общ бутон със SVG зъбно колело е последното действие в долната `helpDock` зона на лявата лента. Той работи еднакво в Конструктор и Проект. Модалният диалог използва съществуващите dialogHead/Body/Foot стилове и отделни section елементи за бъдещо разширяване. Показва текущата кратка версия на интерфейса.

## Какво се измерва

Статистиката е за байтовете на текущите **изходни файлове в публикувания source snapshot**, не за физическия Git disk usage, Git историята или оставаща GitHub квота. Използват се Git tracked файловете и планираните неизключени нови source файлове; `.git`, игнорираните локални файлове, `_site/` и генерираният опис не се броят. В чист Actions checkout това са файловете на публикувания commit. Символни връзки, ако има, се броят като дължината на Git link target текста, не съдържанието на външен файл. Съдържание на submodule не се измерва.

`materials/textures/` размерът включва всички нейни source файлове и подпапки, включително README. Броят снимки е по JPG/JPEG/PNG/WebP разширения, без значение на регистъра. Празната библиотека има 0 снимки; не се добавят фиктивни материали или снимки.

Индикаторът използва 1 GiB като ориентир за компактно хранилище. Изрично е означено, че това не е твърда квота. Над 100% числовият процент продължава да расте, а лентата се насища визуално; няма блокиране на действия. Времето от build metadata се показва в Europe/Sofia. При недостъпни/невалидни данни UI не показва измислени нули и предлага повторно зареждане.

## Автоматично публикуване

`.github/workflows/pages.yml` запазва GitHub Pages/Jekyll и същия сайт/адрес. Собственикът трябва еднократно да избере Settings → Pages → Build and deployment → Source: GitHub Actions; не се създава друга hosting услуга. Автоматичният опит за PUT на тази административна настройка беше отказан от GitHub с 403 `Resource not accessible by integration` (изисква Pages write и Administration write); Actions token не получава Administration право и не се добавя PAT. След тази настройка всяка push публикация в main и workflow_dispatch:

1. Checkout на точния commit.
2. `node scripts/repository-space.mjs` измерва свежите source файлове без npm инсталация, API за размери или GitHub PAT.
3. Записва игнорирания `_data/repository_space.json` опис. Той не се commit-ва и няма bot pushes в main.
4. Съществуващият Jekyll builder генерира статичния `repository-space.json`: сумира byte полетата и добавя build време, версия и SHA.
5. Workflow проверява JSON schema, aggregate стойностите и съответствието на build SHA/version **преди** upload/deploy на Pages artifact.

Конкурентността е в група `pages`; няма Firebase операции. Build/измерването/JSON проверката се изпълняват и преди настройката. Deployment job проверява source и спира с ясна инструкция, ако той още е implicit branch. След ръчния избор на Source собственикът/агентът може да пусне повторно failed deployment job от Actions, без нов кодов commit.

Token-ът съществува само в runner-а с минимални Contents read / Pages write / OIDC права, никога в браузъра или публикувания JSON. Не се използва лично GitHub удостоверение. Ако няма генериран опис (например старият implicit build при първоначалния преход), JSON има inventoryReady=false и интерфейсът показва липса на данни.

`npm test`/`release:prepare` генерират същия опис и локално; `release:check` засича stale source измерване след последващи редакции. Това е допълнителна проверка, не заместител на автоматичното измерване в Actions. Няма bundler или production npm dependencies.

## Текстури от GitHub

Папката `materials/textures/` е готова за файлове, добавени чрез проверен клон/PR. В материалния редактор се приема устойчив относителен адрес като `materials/textures/oak.webp` или `./materials/textures/oak.webp`. Той остава относителен в материалната база и project snapshot-ите и работи под GitHub Pages project path. HTTPS адресите продължават да работят. Няма upload от браузъра или публичен токен.

Разрешени са само изображения в този относителен подкаталог; traversal, root/protocol-relative пътища, кодирани разделители и други относителни директории се отказват. Unicode/интервали се URL-encode-ват. Thumbnail и Three.js loader използват същата валидация.

PWA кешира settings module/статистиката и само публичните same-origin repo JPG/PNG/WebP при използване. Не кешира външни HTTPS текстури, GitHub API, Firebase или потребителски заявки. Старите app caches се почистват при следваща worker activation, без принудително reload и без загуба на чернови.

## Проверки

- repository-space unit тест: byte sizes, рекурсивни image counts, ignored/generated exclusions, idempotence и stale check; stats validation/format.
- settings-browser: общо зъбно колело, двата режима, modal/версия/дата/индикатор, Escape/close, keyboard isolation, error/invalid/empty/over-limit състояния, без browser GitHub API и действително зареждане на относителна текстура.
- release-browser: две версии на worker, нови stats и cache cleanup, offline статистика и repo texture, без user cache и без загуба на чернова.
- grain/XLSX, geometry, grouping, cloud-projects, actions и Firestore Emulator регресии.
