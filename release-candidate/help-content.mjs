// Help for the unified workspace. The legacy help stays in the shared default content.
const guide = [
  ['home', 'Работна база', 'Изберете лична или достъпна за Вас споделена база.', 'Workspace', 'Choose your personal workspace or a shared workspace you can access.'],
  ['cabinet', 'Проектиране', 'Създавайте мебели и цели проекти. Добавяйте шкафове, отделни детайли и уреди в работното пространство.', 'Design', 'Design furniture and complete projects. Add cabinets, individual panels and appliances to the workspace.'],
  ['open', 'Библиотека', 'Съхранявайте проекти и готови модели в папки и ги използвайте повторно.', 'Library', 'Keep projects and reusable models in folders.'],
  ['settings', 'Свойства и материали', 'Редактирайте размери, материали, кантове и посока на фладера. Управлявайте материалните бази от меню „Материали“.', 'Properties and materials', 'Edit dimensions, materials, edging and grain direction. Manage material libraries under Materials.'],
  ['horizontal', 'Справки', 'Получавайте разкрой, количества, калкулация на разходите и експорт на детайлите.', 'Reports', 'Review cut lists, quantities and cost estimates, and export panels.'],
];

const topics = [
  {icon: 'home', bg: ['Създаване на проект',
    'Изберете „Файл → Нов проект“. Въведете име при първото запазване.',
    'От „Настройки → Размери на стаята…“ задайте ширина, височина и дълбочина в милиметри.',
    'Добавете шкаф от „Библиотека“ или добавете шкаф, детайл или уред от лентата с инструменти.',
    'Изберете елемент в сцената или структурата. Използвайте „Свойства“ за размери и позиция и „Инструменти“ за подравняване.',
    'Използвайте „Запази проект“ за текущия проект или „Запази проект като“ за копие. Отворете запазени проекти от „Библиотека → Проекти“.'],
  en: ['Creating a project',
    'Choose File → New project. Enter a name the first time you save.',
    'Under Settings → Room dimensions, set the width, height and depth in millimetres.',
    'Add a cabinet from the Library, or use the toolbar to add a cabinet, panel or appliance.',
    'Select an item in the scene or project tree. Use Properties to edit dimensions and position, and Tools to align it.',
    'Use Save project for the current project or Save project as to make a copy. Open saved projects from Library → Projects.']},
  {icon: 'cabinet', bg: ['Създаване на шкаф',
    'Добавете хоризонтални и вертикални детайли в работната сцена или започнете от „Добави нов шкаф“.',
    'В „Нов шкаф“ изберете вид шкаф и задайте размери, конструкция, рафтове, врати, материали и кантове според нуждите.',
    'Отворете прегледа, проверете конструкцията и създайте шкафа. Редактирайте детайлите от „Свойства“.',
    'Изберете групата в сцената и използвайте командата за запазване на модел, за да го добавите в папка на библиотеката.'],
  en: ['Creating a cabinet',
    'Add horizontal and vertical panels to the scene, or start with Add new cabinet.',
    'In New cabinet, select a cabinet type and set the dimensions, construction, shelves, doors, materials and edging as needed.',
    'Preview the design, then create the cabinet. Use Properties to edit its panels.',
    'Select the group in the scene and save it as a model in a library folder.']},
  {icon: 'image', bg: ['Въвеждане на материали',
    'Отворете „Настройки → Материали“ и изберете материална база.',
    'Добавяйте и редактирайте плоскости, кантове, гръб, плотове и услуги в съответния раздел. За транспортните справки въведете тегло в кг/м² при налични данни.',
    'Изберете детайл и приложете материал, кантове и посока на фладера от „Свойства“. Проверете разкроя и себестойността след промяната.'],
  en: ['Managing materials',
    'Open Settings → Materials and select a material library.',
    'Add or edit boards, edging, back panels, worktops and services in their tabs. Enter weight in kg/m² where available to include it in transport reports.',
    'Select a panel and use Properties to set the material, edging and grain direction. Check the cut list and costs after changes.']},
  {icon: 'open', bg: ['Работа с библиотеката',
    'Отворете „Библиотека“ и изберете действителна папка за модели или „Проекти“.',
    'Натиснете името на модел, за да добавите копие в текущата сцена.',
    'От менюто „⋯“ до модел можете да го преименувате, преместите, копирате или изтриете, ако имате права за запис. Изтриването от библиотеката запазва вече добавените екземпляри.'],
  en: ['Using the library',
    'Open Library and select a model folder or Projects.',
    'Select a model name to insert a copy in the current scene.',
    'Use the model’s ⋯ menu to rename, move, copy or delete it if you have write access. Deleting a library model keeps copies already added to a scene.']},
  {icon: 'horizontal', bg: ['Четене на справките',
    '„Разкрой“ показва размер A по фладера, размер Б, брой и кантове. Експортът Salex създава XLSX файл на български.',
    '„Себестойност“ изчислява материалите и услугите по наличните цени и зададената използваемост.',
    'В „Подреждане за транспорт“ задайте ширина, дължина и максимална височина на товара. Проверете всички товари и оставащи детайли. Теглото се показва за детайлите с известни стойности.'],
  en: ['Reading reports',
    'Cut list shows Dimension A along the grain, Dimension B, quantities and edging. The Salex export produces an XLSX workbook in Bulgarian.',
    'Cost estimate uses the available material and service prices and the selected sheet utilisation.',
    'In Transport layout, set the load width, length and maximum height. Check all loads and any unplaced panels. Weight is shown for panels with available data.']},
  {icon: 'info', bg: ['Бутони и управление',
    'Изберете детайл в сцената или в структурата на проекта. На телефон отворете панела „Свойства“ от лентата под сцената.',
    'Сменяйте изгледа от „Изглед“. Размерните линии, етикетите и прозрачността помагат при проверка на сцената.',
    'Групирайте, разгрупирайте, копирайте или изтривайте от „Редакция“ или контекстното меню. Използвайте Ctrl+Z за отмяна и Ctrl+Y за повторение.'],
  en: ['Controls and shortcuts',
    'Select a panel in the scene or project tree. On a phone, open Properties from the bar below the scene.',
    'Change the camera from View. Use dimensions, labels and transparency to inspect the scene.',
    'Group, ungroup, copy or delete from Edit or the context menu. Use Ctrl+Z to undo and Ctrl+Y to redo.']},
];

export function workspaceHelp(language) {
  const english = language === 'en';
  return {
    guide: guide.map(([icon, title, description, enTitle, enDescription]) =>
      [icon, english ? enTitle : title, english ? enDescription : description]),
    topics: topics.map(({icon, bg, en}) => {
      const [title, ...steps] = english ? en : bg;
      return {icon, title, steps};
    }),
  };
}
