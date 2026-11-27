import {english} from './english-ui.mjs';

const key = 'nediq.v3.language';
export function preferredLanguage(storage) {
  try { return storage.getItem(key) === 'en' ? 'en' : 'bg'; }
  catch { return 'bg'; }
}

export function translate(text, language) {
  return language === 'en' && Object.hasOwn(english, text) ? english[text] : text;
}

export const t = text => translate(text, globalThis.document?.documentElement.lang);

// For renderer-authored markup only. Call before user records are attached.
export function translateMarkup(root, {includeOptions = true} = {}) {
  if (document.documentElement.lang !== 'en') return;
  const selector = 'button, label, summary, h1, h2, h3, legend, dt, [aria-label], [title], [placeholder]';
  const elements = [...root.querySelectorAll(includeOptions ? selector + ', option' : selector)];
  if (root.matches?.(selector)) elements.unshift(root);
  for (const element of elements) {
    if (element.matches('option') && !includeOptions) continue;
    if (element.matches('option:not([value])')) element.value = element.value;
    for (const text of element.childNodes) {
      if (text.nodeType !== Node.TEXT_NODE) continue;
      const original = text.data.trim();
      if (t(original) !== original) text.data = text.data.replace(original, t(original));
    }
    for (const name of ['aria-label', 'title', 'placeholder']) {
      const original = element.getAttribute(name);
      if (original && t(original) !== original) element.setAttribute(name, t(original));
    }
  }
}

// The common renderer creates a few dialogs lazily. Their control captions
// are authored UI. Options (which may be material names) are left as supplied.
export function installWorkspaceLanguage() {
  if (document.documentElement.lang !== 'en') return;
  const dialogs = '#newCabinetDialog, #sharingDialog, .nedConfirmOverlay, .nedPromptOverlay';
  const shell = '#outlineHeading, #mobileWorkspaceBar, #inspectorTitle, #documentOverview dt';
  function update() {
    const heading = document.getElementById('documentHeading');
    const prefix = ['Проект: ', 'Конструктор: '].find(value => heading?.textContent.startsWith(value));
    if (prefix) heading.textContent = t(prefix) + heading.textContent.slice(prefix.length);
    for (const element of document.querySelectorAll(shell)) translateMarkup(element, {includeOptions: false});
    for (const dialog of document.querySelectorAll(dialogs)) {
      // Scope generic confirmation translation to their own action labels and title.
      if (dialog.matches('.nedConfirmOverlay, .nedPromptOverlay') &&
          !dialog.matches(':has(.nedPromptPanel), :has(.nedConfirmActions)')) continue;
      if (dialog.classList.contains('nedConfirmOverlay') && dialog.matches(':has(.libraryDialogItems)')) continue;
      if (dialog.matches('.nedConfirmOverlay') && dialog.querySelector('h3')?.textContent === 'Целева папка') continue;
      if (dialog.matches('.nedConfirmOverlay, .nedPromptOverlay')) {
        for (const node of dialog.querySelectorAll('.nedConfirmActions, .nedPromptActions, .dialogHead')) translateMarkup(node, {includeOptions: false});
      } else translateMarkup(dialog, {includeOptions: false});
    }
    for (const option of document.querySelectorAll('#newCabinet-type option, #newCabinet-top option, #newCabinet-doors option')) {
      const text = t(option.textContent);
      if (text !== option.textContent) option.textContent = text;
    }
  }
  new MutationObserver(records => {
    if (records.some(({target, addedNodes}) => {
      const node = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
      return node?.closest(dialogs + ', ' + shell + ', #documentHeading') ||
        [...addedNodes].some(child => child.matches?.(dialogs + ', ' + shell));
    })) update();
  }).observe(document.body, {subtree: true, childList: true, characterData: true});
  update();
}

export function installLanguageControl({beforeChange, report}) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'v3LanguageChoice';
  const current = document.documentElement.lang;
  control.textContent = current === 'en' ? 'БГ' : 'EN';
  control.lang = current === 'en' ? 'bg' : 'en';
  control.title = current === 'en' ? 'Български' : 'English';
  control.setAttribute('aria-label', control.title);
  control.onclick = async () => {
    control.disabled = true;
    try {
      if (!await beforeChange()) return;
      let saved = false;
      try {
        const language = current === 'en' ? 'bg' : 'en';
        localStorage.setItem(key, language);
        saved = preferredLanguage(localStorage) === language;
      } catch {}
      if (saved) window.location.reload();
      else report(t('Езикът не може да бъде запомнен в този браузър.'));
    } finally {
      control.disabled = false;
    }
  };
  return control;
}
