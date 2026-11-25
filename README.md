# NED-IQ — Kitchen & Furniture Designer

Уеб приложение за проектиране на мебели, кухни и шкафове, управление на материални каталози и подготовка на производствени справки.

[![PR checks](https://github.com/nedkoradev/kitchen-calculator/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/nedkoradev/kitchen-calculator/actions/workflows/pr-checks.yml)

**[Отвори NED-IQ](https://nediq.eu/)** · [Публична версия и ревизия](https://nediq.eu/release.json) · [Legacy v2](https://nedkoradev.github.io/kitchen-calculator/)

## Основни възможности

- Интерактивно 3D проектиране и 2D изгледи.
- Конструиране на шкафове, редактиране на размери, позиции и групи от детайли.
- Облачна библиотека с модели, папки и проекти.
- Материални каталози за ПДЧ, кантове, гърбове, плотове и услуги.
- Управление на текстури, ориентация на фладера и кантиране.
- Справки за разкрой и разходи, включително експорт за Salex.
- Google вход, облачно съхранение и възстановяване на работни чернови.

## Версии и архитектура

Хранилището съдържа две поколения на приложението с независими версии.

| | NED-IQ v3 | Legacy v2 |
| --- | --- | --- |
| Публичен адрес | [nediq.eu](https://nediq.eu/) | [GitHub Pages](https://nedkoradev.github.io/kitchen-calculator/) |
| Изпълнение | Node.js HTTP сървър в Cloud Run | Статично уеб приложение |
| Входна точка | `pilot/server.mjs` | `index.html` |
| Версия | [release.mjs](release-candidate/release.mjs) | [version.json](_data/version.json) |

Технологии: JavaScript ES modules, HTML/CSS, Three.js, Firebase Authentication, Cloud Firestore, Node.js, Docker и GitHub Actions.

```text
pilot/                  HTTP host и конфигурация на v3
release-candidate/      v3 интерфейс, API и release metadata
document-format/        Формат и валидация на документите
workspace-context/      Работен контекст и редактор
workspace-persistence/  Съхранение и транзакции
workspace-ui/           Интеграция на редактора
materials/              Стандартни материали
tests/                  Автоматизирани проверки
docs/                   Техническа документация
.github/workflows/      CI/CD
```

## Данни и достъп

Приложението използва Google Authentication и облачно съхранение. Моделът за споделяне разграничава собственик, редактор и наблюдател. Legacy v2 поддържа избор на споделена база; пълната еквивалентност на този процес във v3 е предмет на текуща разработка. Не приемайте наличието на роля за доказателство, че всяка операция е достъпна във всяка версия.

Достъпът се проверява от сървъра или приложимите Firestore правила. Тестовете използват изолирани данни и емулатори, а не реални клиентски записи. Миграцията от v2 към v3 е отделен контролиран процес.

## Разработка и проверки

Необходими са Git, Node.js според [package.json](package.json) и npm. За Firestore тестовете са необходими и предпоставките за Firebase Emulator Suite.

```bash
git clone https://github.com/nedkoradev/kitchen-calculator.git
cd kitchen-calculator
npm ci
npm test
npm run release:check
npm run test:firestore
```

`npm test` включва автоматична подготовка на legacy release metadata. Проверявайте diff-а след изпълнение. За v3 локално стартиране и изолирана конфигурация следвайте [архитектурата](docs/ARCHITECTURE.md) и [ръководството за внедряване](docs/NEDIQ-3-DEPLOYMENT-AUTOMATION.md); не използвайте production данни за тестове.

## CI/CD и публикуване

Промените се разработват в отделен клон от актуалния main и се предлагат чрез Pull Request. Задължителните GitHub проверки трябва да преминат успешно преди сливане. Критичните промени изискват отделно одобрение според AGENTS.md.

Публичният v3 deployment използва контейнерни образи, проверки на кандидат-ревизията, контролирано пренасочване на трафика и rollback при неуспешна проверка. Действително публикуваната версия и commit SHA се сверяват чрез [release.json](https://nediq.eu/release.json). Legacy v2 се публикува независимо чрез GitHub Pages.

## Документация

| Документ | Предназначение |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Задължителни правила за разработка и AI агенти |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Актуален контекст и продуктови решения |
| [Архитектура](docs/ARCHITECTURE.md) | Разграничение между v2, v3 и общ код |
| [UI Design System](docs/UI-DESIGN-SYSTEM.md) | Визуални стандарти |
| [UX Specification](docs/UX-SPECIFICATION.md) | Поведение на интерфейса |
| [UI Components](docs/UI-COMPONENTS.md) | Регистър на компонентите |
| [Unified Document Format](docs/UNIFIED-DOCUMENT-FORMAT.md) | Формат на документите и миграция |
| [Deployment Automation](docs/NEDIQ-3-DEPLOYMENT-AUTOMATION.md) | Автоматизирано внедряване на v3 |

За предложения и дефекти използвайте [GitHub Issues](https://github.com/nedkoradev/kitchen-calculator/issues). При докладване на проблем посочете версията, стъпките за възпроизвеждане и очакваното поведение, без да публикувате лични данни или токени.
