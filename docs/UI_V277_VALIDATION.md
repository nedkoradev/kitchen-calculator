# v2.77 — проверка преди публикуване

- База: c32d48c (v2.76).
- `npm test`: **169 успешни unit теста**, без failures/skips.
- **60 успешни браузърни скрипта** (списъкът е по-долу).
- Chromium / WebGL, desktop и 320/390 px; официалните CDN скриптове са кеширани локално за тестовете.
- Облачните сценарии използват изолиран Firebase SDK double. Не са презаписвани потребителски проекти.
- Release/PWA регресията проверява кеша и запазването на незаписана работа. Онлайн версията и deployment се проверяват след merge и се отчитат в PR/финалния отговор.

Регресията за новия интерфейс е `compact-ui-browser`; локалните версии, втори reload и забранен storage са в `document-recovery-browser`. Сценарият за профили проверява и смяна на профил по време на потвърждение за изтриване.

| Браузърен скрипт | Резултат |
| --- | --- |
| `tests/actions-browser.cjs` | PASS |
| `tests/added-panels-browser.cjs` | PASS |
| `tests/all-material-textures-browser.cjs` | PASS |
| `tests/appliances-browser.cjs` | PASS |
| `tests/architectural-dimensions-browser.cjs` | PASS |
| `tests/bottom-side-edges-browser.cjs` | PASS |
| `tests/browser.cjs` | PASS |
| `tests/cabinet-dimensions-browser.cjs` | PASS |
| `tests/cabinet-dimensions-complex-browser.cjs` | PASS |
| `tests/cabinet-generator-browser.cjs` | PASS |
| `tests/cabinet-save-browser.cjs` | PASS |
| `tests/cloud-projects-browser.cjs` | PASS |
| `tests/compact-tables-browser.cjs` | PASS |
| `tests/compact-ui-browser.cjs` | PASS |
| `tests/decor-interface-browser.cjs` | PASS |
| `tests/default-material-base-browser.cjs` | PASS |
| `tests/document-baseline-browser.cjs` | PASS |
| `tests/document-commands-browser.cjs` | PASS |
| `tests/document-contexts-browser.cjs` | PASS |
| `tests/document-recovery-browser.cjs` | PASS |
| `tests/document-tree-browser.cjs` | PASS |
| `tests/edge-directions-browser.cjs` | PASS |
| `tests/edge-line-visual-browser.cjs` | PASS |
| `tests/generator-independent-bands-browser.cjs` | PASS |
| `tests/generator-materials-browser.cjs` | PASS |
| `tests/generator-shared-edges-browser.cjs` | PASS |
| `tests/grain-browser.cjs` | PASS |
| `tests/grain-face-browser.cjs` | PASS |
| `tests/grouping-browser.cjs` | PASS |
| `tests/inspector-browser.cjs` | PASS |
| `tests/integer-mm-browser.cjs` | PASS |
| `tests/live-resize-visuals-browser.cjs` | PASS |
| `tests/locked-shelf-browser.cjs` | PASS |
| `tests/material-photo-browser.cjs` | PASS |
| `tests/nebraska-browser.cjs` | PASS |
| `tests/part-grain-browser.cjs` | PASS |
| `tests/part-labels-browser.cjs` | PASS |
| `tests/part-notes-browser.cjs` | PASS |
| `tests/photo-wizard-browser.cjs` | PASS |
| `tests/physical-edge-labels-browser.cjs` | PASS |
| `tests/project-save-view-browser.cjs` | PASS |
| `tests/rail-edges-browser.cjs` | PASS |
| `tests/red-edge-preview-browser.cjs` | PASS |
| `tests/release-browser.cjs` | PASS |
| `tests/rendering-browser.cjs` | PASS |
| `tests/report-context-browser.cjs` | PASS |
| `tests/responsive-workspace-browser.cjs` | PASS |
| `tests/review-browser.cjs` | PASS |
| `tests/runner-spacing-browser.cjs` | PASS |
| `tests/selection-delete-browser.cjs` | PASS |
| `tests/settings-browser.cjs` | PASS |
| `tests/stage1-viewport-browser.cjs` | PASS |
| `tests/texture-manager-browser.cjs` | PASS |
| `tests/transparency-browser.cjs` | PASS |
| `tests/ui-catalog-browser.cjs` | PASS |
| `tests/unified-ui-browser.cjs` | PASS |
| `tests/view-pan-browser.cjs` | PASS |
| `tests/visual-edge-browser.cjs` | PASS |
| `tests/workspace-shell-browser.cjs` | PASS |
| `tests/zoom-browser.cjs` | PASS |
