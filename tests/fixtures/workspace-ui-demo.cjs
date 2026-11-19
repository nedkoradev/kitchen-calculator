module.exports = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NED-IQ · Изолиран тестов редактор</title>
<link rel="stylesheet" href="/app-theme.css"><link rel="stylesheet" href="/table-palette.css">
<style>
body {margin:0;background:#e9eef4;color:#172b42;font:14px 'Segoe UI',system-ui,sans-serif}
header {background:#23384e;color:white;padding:12px 16px}
main {max-width:1000px;margin:auto;padding:12px;display:grid;gap:10px}
section {background:white;border:1px solid #bbc8d8;border-radius:8px;padding:12px;min-width:0}
nav,.actions {display:flex;flex-wrap:wrap;align-items:center;gap:8px}
h1,h2,p {margin:0 0 8px} h1 {font-size:20px} h2 {font-size:16px}
label {display:inline-flex;align-items:center;gap:6px}
button,input,select {min-height:36px;font:inherit;max-width:100%}
input[type=number] {width:6em}
:focus-visible {outline:2px solid #2878d0;outline-offset:2px}
.tableScroll {max-height:350px;overflow:auto}
table {width:100%;border-collapse:collapse} td,th {text-align:left;padding:6px}
dialog {max-width:calc(100vw - 40px);border:1px solid #bbc8d8;border-radius:8px;padding:14px}
dialog.nedMovableDialog {transform:translate(var(--dialog-x,0),var(--dialog-y,0))}
.dialogHead {background:#23384e;color:white;display:flex;align-items:center;justify-content:space-between;touch-action:none;padding:6px;margin-bottom:10px}
.dialogHead button {min-width:44px;min-height:44px}
@media(max-width:600px) {button,input,select {min-height:44px} main {padding:8px}}
</style>
</head><body>
<header>NED-IQ · Тестов редактор v2.95</header>
<main>
<section aria-label="Команди">
<nav aria-label="Документ">
<label>Профил <select id="profile"><option value="alpha">Алфа</option><option value="beta">Бета</option></select></label>
<button id="retry">Провери журнала</button>
<button data-command="newDocument">Нов</button><button id="library">Библиотека</button>
<button data-command="saveDocument">Запази</button><button data-command="saveAsDocument">Запази като нов</button>
<button data-command="undo">Отмени</button><button data-command="redo">Повтори</button>
</nav>
<p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>
</section>
<section aria-labelledby="heading">
<h1 id="heading">Работна сцена</h1><p id="summary"></p>
<form id="room"><label>Ширина на помещението (mm) <input name="width" type="number" min="500" max="30000" required></label>
<button data-edit>Приложи</button></form>
<div class="tableScroll" tabindex="0" role="region" aria-label="Детайли" id="parts"></div>
</section>
</main>
<dialog id="library-dialog" aria-label="Библиотека"><h2>Библиотека</h2>
<label>Папка <select id="folders"><option value="projects">Проекти</option><option value="models">Модели</option></select></label>
<div class="actions"><button id="pick">Отвори проект</button></div>
</dialog>
<dialog id="dirty-dialog" aria-label="Незаписани промени">
<h2>Незаписани промени</h2><form method="dialog"><div class="actions">
<button value="cancel" autofocus>Отказ</button><button value="save">Запази и продължи</button><button value="discard">Отхвърли</button>
</div></form>
</dialog>
<dialog id="name-dialog" aria-label="Запис на документ">
<h2>Запис на документ</h2><form method="dialog"><label>Име <input name="name" required autofocus></label>
<div class="actions"><button value="cancel" formnovalidate>Отказ</button><button value="save">Запази</button></div></form>
</dialog>
<script type="module" src="/tests/fixtures/workspace-ui-demo.mjs"></script>
</body></html>`;
