// Тестовые данные — общие для seed.mjs и security-check.mjs.
// Объект «north» общий для обоих исполнителей; «office» — только executor1, «cottage» — только executor2:
// так проверяется, что исполнитель не видит объект без своих задач.

export const USERS = [
  { key: 'manager', email: 'manager@example.com', role: 'manager', fullName: 'Анна Смирнова' },
  { key: 'executor1', email: 'executor1@example.com', role: 'executor', fullName: 'Иван Петров' },
  { key: 'executor2', email: 'executor2@example.com', role: 'executor', fullName: 'Олег Сидоров' },
];

export const EXECUTORS = USERS.filter((u) => u.role === 'executor');

export const OBJECTS = [
  { key: 'north', name: 'ЖК «Северный», корпус 2', address: 'г. Казань, ул. Северная, 12' },
  { key: 'office', name: 'Офис на Ленина', address: 'г. Казань, ул. Ленина, 45, 3 этаж' },
  { key: 'cottage', name: 'Коттедж в Лесном', address: 'пос. Лесной, ул. Сосновая, 7' },
];

const take = (who) => ['in_progress', who];
const submit = (who) => ['review', who];
const accept = ['accepted', 'manager'];
const rework = (comment) => ['rework', 'manager', comment];

// path — переходы после создания: [статус, ключ пользователя, комментарий?]. Целевой статус — последний шаг.
export const TASKS = [
  {
    object: 'north', assignee: 'executor1',
    title: 'Залить фундамент секции А',
    description: 'Бетон B25, после заливки — фото и акт скрытых работ.',
    path: [take('executor1'), submit('executor1'), rework('Нет фото армирования перед заливкой'),
      take('executor1'), submit('executor1'), accept],
  },
  {
    object: 'north', assignee: 'executor2',
    title: 'Проверить геодезию котлована',
    description: 'Отметки дна по трём осям, протокол приложить к задаче.',
    path: [take('executor2'), submit('executor2')],
  },
  {
    object: 'north', assignee: 'executor1',
    title: 'Установить опалубку секции Б',
    description: 'После приёмки фундамента секции А.',
    path: [],
  },
  {
    object: 'office', assignee: 'executor1',
    title: 'Демонтаж перегородок',
    description: 'Перегородки из ГКЛ в осях 2–4, мусор вывезти.',
    path: [take('executor1')],
  },
  {
    object: 'office', assignee: 'executor1',
    title: 'Разводка электрики, 3 этаж',
    description: 'По проекту ЭМ-3, щиток подписать.',
    path: [take('executor1'), submit('executor1'), rework('Щиток не подписан, переделать маркировку линий')],
  },
  {
    object: 'cottage', assignee: 'executor2',
    title: 'Монтаж кровли',
    description: 'Металлочерепица, снегозадержатели по периметру.',
    path: [take('executor2')],
  },
  {
    object: 'cottage', assignee: 'executor2',
    title: 'Утепление фасада',
    description: 'Минвата 100 мм, после монтажа окон.',
    path: [],
  },
  {
    object: 'cottage', assignee: 'executor2',
    title: 'Установка окон',
    description: 'Шесть окон ПВХ, откосы и отливы.',
    path: [take('executor2'), submit('executor2'), accept],
  },
];

export const targetStatus = (task) => (task.path.length > 0 ? task.path.at(-1)[0] : 'new');
