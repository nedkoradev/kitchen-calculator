# Версии и публикуване

GitHub Pages продължава да използва съществуващия `pages build and deployment` от `main`. Няма нов workflow, bundler или Firebase deployment.

`release.json` и `sw.js` имат Jekyll front matter. Pages заменя `site.github.build_revision` с пълния SHA на публикувания commit. Интерфейсът показва `1.65+<първите осем символа на SHA>`; commit идентификаторът се променя автоматично при всяка публикация. Това е идентификатор на build, не пореден SemVer patch номер. Локален HTTP сървър без Jekyll показва `v1.65-dev` и не регистрира некомпилирания worker.

`app-release.js` проверява release metadata без HTTP кеш и регистрира worker с `updateViaCache: none`. Worker кодът съдържа пълния build SHA и кешът е отделен за scope и SHA. GET заявки само към изрично изброените публични app файлове са network-first с презаверяване на HTTP кеша; копието в Cache Storage е fallback при мрежова грешка. Firebase, authentication, CDN и потребителските данни не се кешират от този worker. CDN/Firebase остават нужни за пълната функционалност; този механизъм не обещава пълно offline приложение.

Няма `skipWaiting`, `clients.claim` или принудително reload. Нова версия се вижда при следващо отваряне/презареждане, а чакащият worker се активира, когато старите контролирани прозорци се затворят. Тогава се изтриват само старите кешове на това приложение и scope; localStorage, IndexedDB и чужди кешове остават.

## Проверки

`node tests/release-browser.cjs` стартира собствен изолиран HTTP сървър и реален Chromium service worker под `/kitchen-calculator/`. Симулира Pages/Jekyll output за две версии и проверява:

- Показване на версията и регистрация в правилния scope.
- Нов worker и нов cache при нов SHA, без reload или загуба на незаписана работа.
- Обновяване на версията при презареждане и изключване на user endpoints от кеша.
- Почистване само на стария app cache при activation и offline fallback на публичния shell/release metadata.

Изпълняват се и `npm test`, `npm run test:firestore`, `tests/browser.cjs`, `tests/grouping-browser.cjs`, `tests/cloud-projects-browser.cjs` със статичен сървър. Browser тестовете изискват Playwright/Chromium; наличните environment опции са в `docs/CLOUD_PROJECTS.md`.

Преди merge се проверяват актуалният main, окончателният head, conflicts, required checks/reviews. След merge се изчаква успешният Pages workflow и се проверяват онлайн `release.json` и версията в интерфейса, когато мрежовата политика позволява достъп. Ако live проверката е блокирана, това се отчита отделно от статуса на Pages deployment.

Онлайн приложение: https://nedkoradev.github.io/kitchen-calculator/
