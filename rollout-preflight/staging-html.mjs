import {version} from '../release-candidate/release.mjs';
export const sheetJsPath = '/staging-sdk/xlsx-0.20.3.min.js';
const legacySheetJs = '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>';
const seam = '}build();frame();';
const loadMaterials = '\nloadDefaultMaterials();';
const welcome = 'requestAnimationFrame(help.showStartup);';
const unsafe = [
  '<script src="./local-reset.js"></script>',
  '<script type="module" src="./app-release.js"></script>',
  '<script type="module" src="./cloud.js"></script>',
  '<link rel="manifest" href="./manifest.webmanifest">',
];

function buildPreview(source, {enabled, settings}) {
  let html = source;
  // The local fallback uses the legacy renderer offline. Even the disabled
  // preview must not boot a production Firebase client or service worker.
  for (const tag of unsafe) {
    if (html.split(tag).length !== 2) throw new Error('Review the preview safety boundary: a legacy tag changed');
    html = html.replace(tag, '');
  }
  if (!enabled) return html;
  if (html.split(legacySheetJs).length !== 2) throw new Error('Expected one legacy SheetJS script');
  html = html.replace(legacySheetJs, '<script src="' + sheetJsPath + '"></script>');
  if (html.split(seam).length !== 2 || html.split(loadMaterials).length !== 2 ||
      html.split(welcome).length !== 2 || html.split('<body>').length !== 2 || html.split('</head>').length !== 2) {
    throw new Error('Expected a local emulator and one renderer bootstrap seam');
  }
  if (html.split('<script type="module">').length !== 2 ||
      html.split('names:Object.fromEntries(projectInstances)').length !== 2) {
    throw new Error('Expected one v3 group-name visualization seam');
  }
  html = html.replace('<script type="module">',
    '<script type="module">\nimport {v3GroupNameMap} from "./release-candidate/group-names.mjs";\nimport {localizeReport} from "./release-candidate/report-language.mjs";\nimport {preferredLanguage, t, translateMarkup} from "./release-candidate/i18n.mjs";\ntry { document.documentElement.lang = preferredLanguage(localStorage); } catch {}\ntranslateMarkup(document);');
  html = html.replace('names:Object.fromEntries(projectInstances)',
    'names:Object.fromEntries(document.body.dataset.stageAuth ? v3GroupNameMap(customParts,Object.fromEntries(projectInstances)) : Object.fromEntries(projectInstances))');
  // The v3 report uses the same cutLayout values as XLSX. Keep the legacy
  // renderer's combined column on the static v2 site.
  const cutColumns = [
    ["long+' × '+short+' мм'+(grainRequired?' ↔':'')", "long+' мм'+(grainRequired?' ↔':''),short+' мм'"],
    ['table(cutTableHeaders,cutRows)', "table([...cutTableHeaders.slice(0,3),'Размер А (фладер)','Размер Б',...cutTableHeaders.slice(4)],cutRows)"],
    ['td.colSpan=6;td.textContent=label', 'td.colSpan=7;td.textContent=label'],
    ["[2,4,6].includes(i)?'center':'left'", "[2,3,4,5,7].includes(i)?'center':'left'"],
    ["if(i===4)cell.style.whiteSpace='nowrap'", "if([3,4,5].includes(i))cell.style.whiteSpace='nowrap'"],
    ['const edgeCell=tr.cells[5]', 'const edgeCell=tr.cells[6]'],
  ];
  for (const [original, replacement] of cutColumns) {
    if (html.split(original).length !== 2) throw new Error('Expected one cut report renderer seam');
    html = html.replace(original, replacement);
  }
  const css = '<link rel="stylesheet" href="./release-candidate/panels.css">';
  const helpImport = "import {installHelp} from './help-ui.mjs';";
  const reportReady = ' cost.append(note);';
  if (html.split(helpImport).length !== 2 || html.split(reportReady).length !== 2) {
    throw new Error('Expected one v3 help import and report localisation seam');
  }
  html = html.replace(helpImport, "import {installHelp} from './release-candidate/help-ui.mjs';");
  html = html.replace(reportReady, reportReady + '\n localizeReport({context, root, cut, cost, note, utilizationLabel, unpriced});');
  const shellReady = 'dockedInspector=installInspector(';
  if (html.split(shellReady).length !== 2) throw new Error('Expected one workspace shell localisation seam');
  html = html.replace(shellReady, `translateMarkup(document.getElementById('shellMenus'));
    document.getElementById('reportsMenu').addEventListener('toggle', () => {
      for (const [id, label] of [['navCut', 'Разкрой'], ['navCosts', 'Разходи']]) {
        $(id).textContent = t(label) + ' — ' + currentDocumentInfo().name;
      }
    });
  ` + shellReady);
  html = html.replace(loadMaterials, '\nconst stagingMaterialsReady = loadDefaultMaterials();');
  html = html.replace(welcome, '').replace('</head>', css + '</head>');
  html = html.replace('<body>', '<body data-stage-auth="locked">');
  html = html.replace(seam, seam + `
    document.querySelector('main').inert = true;
    void import('./rollout-preflight/staging-auth.mjs').then(({startStagingAuth}) => startStagingAuth({
      ... ${JSON.stringify(settings).replaceAll('<', '\\u003c')}, materialsReady: stagingMaterialsReady, activate: () => activateMainNavigation('project'),
      showWelcome(signInPanel) {
        const welcomeDialog = $('welcomeDialog');
        signInPanel.before(welcomeDialog);
        help.showStartup();
      },
      views: {
        renderMaterials: renderMaterialsPage,
        transportContext: scope => buildReportContext(scope ?? {kind: 'whole'}),
        renderReport(scope) {
          activeReport = null;
          projectRefresh(scope ? buildReportContext(scope) : undefined);
        },
      },
      editor: {
        capture: captureProjectSnapshot,
        title(name) { $('projectTitle').value = name; $('projectName').value = name; },
        apply(snapshot) {
          applyProjectSnapshot(snapshot, {preserveIdentity: true});
          syncDocumentCounters(); build(false); updateSelection(); refreshGroupList();
        },
        onChange(listener) {
          const legacyBuild = build;
          build = (...args) => { const result = legacyBuild(...args); listener(); return result; };
        },
      }
    })).catch(() => {
      document.body.dataset.stageAuth = 'locked';
      const status = document.createElement('p');
      status.setAttribute('role', 'alert');
      status.textContent = 'Тестовият вход е недостъпен.';
      document.querySelector('main').before(status);
    });
  `);
  // The compat distribution is served from the installed, pinned SDK on loopback.
  return html.replace('</head>', '<script defer src="/staging-sdk/app.js"></script>' +
    '<script defer src="/staging-sdk/auth.js"></script>' +
    (settings.pilot?.public && !settings.pilot.localGoogle ? '<script defer src="/staging-sdk/firestore.js"></script>' : '') + '</head>');
}

export function buildLocalPreview(source, {enabled = false, authOrigin} = {}) {
  if (enabled && !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(authOrigin)) throw new Error('Expected loopback Auth');
  return buildPreview(source, {enabled, settings: {authOrigin}});
}

export function buildPilotPreview(source, config) {
  const settings = {pilot: {origin: config.origin, authDomain: config.authDomain, apiKey: config.apiKey, public: config.public === true, version: config.public ? version : undefined}};
  if (config.localGoogle) Object.assign(settings.pilot, {localGoogle: true, projectId: config.projectId});
  const html = buildPreview(source, {enabled: true, settings});
  if (config.public) return html.replace('<title>Kitchen Designer</title>', '<title>NED-IQ v' + version + '</title>')
    .replace(/(id="appVersion">)v[0-9.]+/, '$1v' + version);
  return html.replace('</body>', '<span id="pilotVersion" aria-label="Версия на NED-IQ Pilot">Pilot v3.0.1</span></body>');
}
