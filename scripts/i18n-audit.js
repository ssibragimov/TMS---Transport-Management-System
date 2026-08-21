/**
 * Ревизия покрытия перевода.
 *
 * Запуск: npm run i18n:audit  (и npm run i18n:audit -- --strict для CI)
 *
 * Зачем скрипт, а не разовая проверка глазами: строк в интерфейсе больше
 * пятисот, и на каждом новом экране покрытие проседает молча. Пропущенный
 * t() не ломает сборку, не роняет тест и виден только тому, кто переключил
 * язык именно на этом экране.
 *
 * Скрипт считает четыре разные вещи, и путать их нельзя:
 *
 *   1. Литеральные ключи t('Текст') — их покрытие словарями uz/en.
 *   2. Значения справочников подписей (CATEGORY_LABEL и подобные). Это тоже
 *      ключи перевода, но подставляемые в t(ПЕРЕМЕННАЯ) во время работы.
 *      Простой поиск литералов их не видит и объявляет живые переводы
 *      мёртвыми — на этом ошибались первые версии этой проверки.
 *   3. Справочники подписей, отрендеренные БЕЗ t(). Их переводы лежат
 *      в словаре, но на экран всё равно идёт русский. Самый обидный случай:
 *      работа переводчика сделана и выброшена.
 *   4. Русский текст, не обёрнутый ни во что. Эти строки не переведутся
 *      никогда, сколько ни правь словари.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'apps/web/src');
const SHARED = path.join(ROOT, 'packages/shared/src');
const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Порог русских строк вне механизма перевода.
 *
 * Не ноль: часть строк осознанно оставлена (например, единицы измерения
 * в формах ввода). Порог обязан снижаться, а не расти, — поэтому он зашит
 * здесь и проверяется в --strict.
 */
const RAW_BASELINE = 182;

// ─── Обход файлов ───────────────────────────────────────────────────────────

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Словарь загружается исполнением, а не разбором регуляркой.
 *
 * Ключи в нём бывают и в кавычках, и без: кириллица — допустимый
 * идентификатор JS, поэтому `Главная: 'Bosh sahifa'` совершенно законно,
 * и регулярка, требующая кавычек, теряет половину словаря.
 */
function loadDictionary(file) {
  const source = fs
    .readFileSync(file, 'utf8')
    .replace(/export\s+const\s+\w+\s*:\s*Record<[^>]*>\s*=/, 'RESULT =')
    .replace(/export\s+const\s+\w+\s*=/, 'RESULT =');
  const sandbox = { RESULT: null };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.RESULT ?? {};
}

/** Строки без комментариев: русский текст в пояснениях переводить не нужно. */
function codeLines(source) {
  const lines = [];
  let inBlockComment = false;
  for (const line of source.split('\n')) {
    if (/^\s*\/\*/.test(line)) inBlockComment = true;
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    lines.push(line.replace(/\/\/.*$/, ''));
  }
  return lines;
}

// ─── Сбор данных ────────────────────────────────────────────────────────────

const uz = loadDictionary(path.join(WEB, 'i18n/uz.ts'));
const en = loadDictionary(path.join(WEB, 'i18n/en.ts'));
const uzKeys = new Set(Object.keys(uz));
const enKeys = new Set(Object.keys(en));

const files = walk(WEB).filter((file) => !file.includes(`i18n${path.sep}`));

const literalKeys = new Map();
let dynamicCalls = 0;

for (const file of files) {
  const relative = path.relative(WEB, file);
  const source = fs.readFileSync(file, 'utf8');

  // Либо t('строка'), либо t(ПЕРЕМЕННАЯ[...]) / t(ПЕРЕМЕННАЯ.поле)
  const call = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*\s*[[.]))/g;
  let match;
  while ((match = call.exec(source))) {
    if (match[3]) {
      dynamicCalls += 1;
      continue;
    }
    const key = (match[1] ?? match[2]).replace(/\\'/g, "'");
    if (!literalKeys.has(key)) literalKeys.set(key, new Set());
    literalKeys.get(key).add(relative);
  }
}

/** Значения справочников подписей — ключи, подставляемые во время работы. */
function labelValues(file) {
  const source = fs.readFileSync(file, 'utf8');
  const values = new Set();
  const blocks = /export\s+const\s+([A-Z][A-Z0-9_]*_LABELS?[A-Z0-9_]*)[^=]*=\s*\{([\s\S]*?)\n\};/g;
  let block;
  while ((block = blocks.exec(source))) {
    // ROLE_LABELS хранит все три языка сразу и в словарь не ходит, см. ниже.
    if (block[1] === 'ROLE_LABELS') continue;
    const value = /:\s*'((?:[^'\\]|\\.)*)'/g;
    let hit;
    while ((hit = value.exec(block[2]))) {
      const text = hit[1].replace(/\\'/g, "'");
      if (CYRILLIC.test(text)) values.add(text);
    }
  }
  return values;
}

/*
 * Справочники подписей ищутся во всех файлах интерфейса, а не только
 * в lib/labels.ts: часть из них объявлена прямо на экране (KIND_LABEL
 * в OfficesPanel, STATUS_LABEL в UsersPage). Пропустив их, проверка
 * объявляла бы живые переводы осиротевшими.
 */
const labelFiles = [...walk(WEB).filter((f) => !f.includes(`i18n${path.sep}`)), ...walk(SHARED)];

const labels = new Map();
for (const file of labelFiles) {
  for (const value of labelValues(file)) {
    if (!labels.has(value)) labels.set(value, path.relative(ROOT, file));
  }
}

/*
 * ROLE_LABELS сюда намеренно не входит.
 *
 * Он устроен иначе — { ru: '…', uz: '…', en: '…' } — и содержит все три
 * языка сразу, потому что названия ролей нужны и серверу. Клиент берёт
 * их напрямую (см. roleLabel в lib/labels.ts), мимо словаря i18next,
 * поэтому русские значения оттуда ключами перевода не являются.
 */

/** Справочники подписей, использованные без обёртки t(). */
const unwrapped = new Map();
for (const file of files) {
  const relative = path.relative(WEB, file);
  const source = fs.readFileSync(file, 'utf8');

  const direct = /(t\(\s*)?\b([A-Z][A-Z0-9_]*_LABELS?[A-Z0-9_]*)\s*[[.]/g;
  let match;
  while ((match = direct.exec(source))) {
    if (match[1]) continue;
    if (!unwrapped.has(match[2])) unwrapped.set(match[2], new Set());
    unwrapped.get(match[2]).add(relative);
  }

  // Object.entries(SOME_LABEL).map(...) в выпадающих списках — тоже мимо t()
  const entries = /Object\.entries\(\s*([A-Z][A-Z0-9_]*_LABELS?[A-Z0-9_]*)\s*\)/g;
  while ((match = entries.exec(source))) {
    if (!unwrapped.has(match[1])) unwrapped.set(match[1], new Set());
    unwrapped.get(match[1]).add(relative);
  }
}

/** Русский текст вне любого механизма перевода. */
const raw = new Map();
for (const file of files) {
  const relative = path.relative(WEB, file);
  // labels.ts — определения подписей, они учтены отдельным разделом.
  if (relative.replace(/\\/g, '/') === 'lib/labels.ts') continue;

  let count = 0;
  const samples = [];
  for (const line of codeLines(fs.readFileSync(file, 'utf8'))) {
    if (!CYRILLIC.test(line)) continue;
    const strings = /(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`]*)`)/g;
    let hit;
    while ((hit = strings.exec(line))) {
      const text = hit[1] ?? hit[2] ?? hit[3] ?? '';
      if (!CYRILLIC.test(text)) continue;
      const before = line.slice(Math.max(0, hit.index - 4), hit.index);
      if (/t\(\s*$/.test(before)) continue;
      count += 1;
      if (samples.length < 2) samples.push(text.slice(0, 55));
    }
  }
  if (count > 0) raw.set(relative, { count, samples });
}

// ─── Отчёт ──────────────────────────────────────────────────────────────────

const keys = [...literalKeys.keys()];
const missingUz = keys.filter((key) => !uzKeys.has(key));
const missingEn = keys.filter((key) => !enKeys.has(key));

const labelList = [...labels.keys()];
const labelMissingUz = labelList.filter((key) => !uzKeys.has(key));
const labelMissingEn = labelList.filter((key) => !enKeys.has(key));

const rawTotal = [...raw.values()].reduce((sum, item) => sum + item.count, 0);
const share = (part, whole) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`);

console.log('═══ Строки в t(\'...\') ═══');
console.log(`  уникальных ключей: ${keys.length}`);
console.log(
  `  узбекский: ${keys.length - missingUz.length} (${share(keys.length - missingUz.length, keys.length)}), не хватает ${missingUz.length}`,
);
console.log(
  `  английский: ${keys.length - missingEn.length} (${share(keys.length - missingEn.length, keys.length)}), не хватает ${missingEn.length}`,
);
console.log(`  вызовов t(ПЕРЕМЕННАЯ): ${dynamicCalls}`);

console.log('\n═══ Значения справочников подписей ═══');
console.log(`  подписей всего: ${labelList.length}`);
console.log(`  нет в узбекском: ${labelMissingUz.length}, нет в английском: ${labelMissingEn.length}`);

console.log('\n═══ Справочники, отрендеренные без t() ═══');
if (unwrapped.size === 0) console.log('  нет');
for (const [name, places] of [...unwrapped].sort()) {
  console.log(`  ${name} ← ${[...places].join(', ')}`);
}

/*
 * Осиротевшие переводы: в словаре есть, из кода недостижимы.
 *
 * Главный симптом выбранной схемы «ключ = русский текст»: правка русской
 * строки равносильна переименованию ключа, и перевод молча остаётся
 * висеть в словаре, а на экран уходит русский. Второй источник тех же
 * сирот — подпись, отрендеренная без t(): перевод сделан и выброшен.
 */
const reachable = new Set([...keys, ...labelList]);
/*
 * Ключи error.* подставляются в t() машинным кодом ответа API
 * (см. errorMessage в api/client.ts), в исходниках их литералов нет.
 * Считать их осиротевшими нельзя — иначе проверка будет требовать
 * удалить ровно те переводы, ради которых её и завели.
 */
const isErrorKey = (key) => key.startsWith('error.');

/*
 * Единицы измерения приходят из номенклатуры (spare_parts.unit) и попадают
 * в t() значением из базы, а не литералом. В исходниках их нет, поэтому
 * список приходится держать здесь. Он должен совпадать с UNITS
 * в StockItemModal — иначе кладовщик заведёт позицию в единице,
 * которой нет в словаре.
 */
const DYNAMIC_UNITS = new Set(['шт', 'л', 'кг', 'м', 'компл', 'упак', 'пара']);
const isDynamic = (key) => isErrorKey(key) || DYNAMIC_UNITS.has(key);

const orphanUz = [...uzKeys].filter((key) => !reachable.has(key) && !isDynamic(key));
const orphanEn = [...enKeys].filter((key) => !reachable.has(key) && !isDynamic(key));

console.log('\n═══ Осиротевшие переводы (есть в словаре, из кода недостижимы) ═══');
console.log(`  узбекских: ${orphanUz.length}, английских: ${orphanEn.length}`);
for (const key of orphanUz.slice(0, 10)) {
  console.log(`  «${key.slice(0, 58)}» → ${String(uz[key]).slice(0, 34)}`);
}

console.log('\n═══ Русский текст вне механизма перевода ═══');
console.log(`  ${rawTotal} строк в ${raw.size} файлах (порог ${RAW_BASELINE})`);
for (const [file, item] of [...raw].sort((a, b) => b[1].count - a[1].count).slice(0, 15)) {
  console.log(`  ${String(item.count).padStart(4)}  ${file}   напр.: ${item.samples[0]}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  literal: { total: keys.length, missingUz, missingEn },
  labels: { total: labelList.length, missingUz: labelMissingUz, missingEn: labelMissingEn },
  orphans: { uz: orphanUz, en: orphanEn },
  unwrapped: [...unwrapped].map(([name, places]) => ({ name, places: [...places] })),
  raw: [...raw].map(([file, item]) => ({ file, count: item.count })),
};
const out = path.join(ROOT, 'apps/web/i18n-report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 1), 'utf8');
console.log(`\nПодробный отчёт: ${path.relative(ROOT, out)}`);

if (process.argv.includes('--strict')) {
  const problems = [];
  if (missingUz.length > 0) problems.push(`нет ${missingUz.length} узбекских переводов`);
  if (rawTotal > RAW_BASELINE) {
    problems.push(`русских строк вне t() стало ${rawTotal}, порог ${RAW_BASELINE}`);
  }
  if (problems.length > 0) {
    console.error(`\nПроверка не пройдена: ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log('\nПроверка пройдена.');
}
