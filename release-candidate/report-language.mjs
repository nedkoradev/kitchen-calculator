import {t} from './i18n.mjs';

const edgeSides = /(^| · )(А долу \(З\)|А горе \(П\)|Б дясно \(Д\)|Б ляво \(Л\))(?= \()/g;
const costNotes = ['Няма цена', 'Няма подходящ размер', 'Недостатъчна широчина'];

function units(text) {
  return text.replace(/(?<=\d)( мм| м²| м)(?=\s|$)/g, unit => t(unit));
}

function update(cell, text = t(cell.textContent)) {
  cell.textContent = text;
}

export function localizeReport({context, root, cut, cost, note, utilizationLabel, unpriced}) {
  if (document.documentElement.lang !== 'en') return;

  // Translate report-owned labels. Project names, panel notes and catalogue names
  // may contain the same words, so leave the cells that carry them alone.
  update(cut.parentElement.querySelector('h2'), t('Разкрой') + ' — ' + context.name);
  update(cost.parentElement.querySelector('h2'), t('Разходи') + ' — ' + context.name);
  root.textContent = root.textContent
    .replace(/^Избрани шкафове: |^Целият проект|^Самостоятелен модел/, label => t(label))
    .replace(/ шкафа \/ групи| детайла/g, label => t(label));
  for (const label of [...cut.querySelectorAll('thead th'), ...cost.querySelectorAll('thead th')]) update(label);
  for (const {cells} of cut.querySelectorAll('tbody tr')) {
    for (const index of [3, 4, 5, 7]) update(cells[index], units(cells[index].textContent));
    const edge = cells[6];
    if (edge.textContent === 'няма') update(edge);
    for (const line of edge.children) {
      update(line, line.textContent.replace(edgeSides, (_, separator, side) => separator + t(side)));
    }
  }
  for (const row of cut.querySelectorAll('tfoot tr')) update(row.cells[1], units(row.cells[1].textContent));
  update(cut.querySelector('tfoot tr:last-child td'));

  const costRows = [...cost.querySelectorAll('tbody tr')];
  const totalsStart = costRows.findIndex(row => row.classList.contains('costSubtotal') &&
    [...row.cells].slice(1, 6).every(cell => cell.textContent === ''));
  for (const [index, row] of costRows.entries()) {
    const {cells} = row;
    const label = cells[0];
    if (totalsStart >= 0 && index >= totalsStart) {
      const text = label.textContent;
      if (text.startsWith('Кант — ')) update(label, text.replace(/^Кант/, t('Кант')));
      else update(label);
    }
    for (const column of [1, 4, 5]) update(cells[column],
      units(cells[column].textContent).replace(/ пл\.$/, ' ' + t('пл.')));
    update(cells[2], cells[2].textContent.replace(/ цял| пл\.| детайла/g, term => {
      return term === ' детайла' ? t(term) : ' ' + t(term.trim());
    }));
    update(cells[3]);
    if (costNotes.includes(cells[6].textContent)) update(cells[6]);
  }

  note.textContent = t('Изчисление с {usage} използваемост и избор между цели и половин листове по цена; не е оптимизиран геометричен разкрой. ПДЧ/ХДФ: {usage} използваемост по площ. Плотове: по дължина и реално побиране на детайлите, без коефициент за използваемост. Не включва обков.')
    .replaceAll('{usage}', utilizationLabel) + (unpriced ? t(' Някои материали нямат цена.') : '');
}
