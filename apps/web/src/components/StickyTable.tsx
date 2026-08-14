import { Table } from 'antd';
import type { TableProps } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Key,
  type ReactNode,
  type ThHTMLAttributes,
} from 'react';
import { useLocation } from 'react-router-dom';

import { useTableCard } from './TableCard';

/**
 * Таблица с закреплёнными заголовками и колонками, которые пользователь
 * переставляет и растягивает мышью.
 *
 * Отдельный компонент, а не пропсы на каждой странице: отступ сверху зависит
 * от высоты шапки конкретной карточки, а настройку колонок нужно хранить и
 * восстанавливать — повторять это в полутора десятках мест значит разъехаться
 * в одном из них.
 *
 * Перетаскивание и растягивание сделаны на штатных событиях браузера, без
 * внешней библиотеки: задача сводится к перестановке ячеек заголовка и смене
 * их ширины, и тянуть ради этого dnd-kit с react-resizable в сборку незачем.
 */

const STORAGE_PREFIX = 'gsm.columns.';
/** Уже этого колонка не станет: заголовок должен оставаться читаемым. */
const MIN_WIDTH = 60;

/**
 * Достаточно того, что есть у любой колонки. Конкретный ColumnType здесь не
 * нужен и только мешает: у группы колонок нет dataIndex.
 */
interface ColumnLike {
  key?: Key;
  dataIndex?: unknown;
  title?: unknown;
  width?: number | string;
}

/** Ключ колонки: то, чем её можно опознать между сеансами. */
function columnKeyOf(column: ColumnLike, index: number): string {
  if (column.key !== undefined && column.key !== null) return String(column.key);
  if (column.dataIndex !== undefined && column.dataIndex !== null) {
    return String(column.dataIndex);
  }
  return `#${index}`;
}

/** Короткая свёртка строки — чтобы не хранить в ключе весь список колонок. */
function digest(input: string): string {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(value).toString(36);
}

interface Layout {
  order: string[] | null;
  widths: Record<string, number>;
}

const EMPTY_LAYOUT: Layout = { order: null, widths: {} };

/**
 * Сохранённый порядок приводится к текущему набору колонок: исчезнувшие
 * отбрасываются, новые добавляются в конец. Иначе после доработки таблицы
 * пользователь со старой раскладкой не увидел бы новую колонку вовсе.
 */
function reconcile(saved: string[], keys: string[]): string[] {
  const known = new Set(keys);
  const kept = saved.filter((key) => known.has(key));
  const missing = keys.filter((key) => !kept.includes(key));
  return [...kept, ...missing];
}

function readLayout(storageId: string, keys: string[]): Layout {
  try {
    const raw = localStorage.getItem(storageId);
    if (!raw) return EMPTY_LAYOUT;
    const parsed: unknown = JSON.parse(raw);

    // Раскладки, сохранённые до появления ширины, хранились простым массивом.
    if (Array.isArray(parsed)) {
      return { order: reconcile(parsed as string[], keys), widths: {} };
    }

    const value = parsed as Partial<Layout>;
    return {
      order: Array.isArray(value.order) ? reconcile(value.order, keys) : null,
      widths: value.widths && typeof value.widths === 'object' ? value.widths : {},
    };
  } catch {
    // Испорченное значение в хранилище не должно ломать таблицу.
    return EMPTY_LAYOUT;
  }
}

interface HeaderApi {
  draggingKey: string | null;
  overKey: string | null;
  begin: (key: string) => void;
  hover: (key: string) => void;
  drop: (key: string) => void;
  end: () => void;
  startResize: (key: string, event: React.MouseEvent<HTMLElement>) => void;
  resizingKey: string | null;
}

const HeaderContext = createContext<HeaderApi | null>(null);

/**
 * Ячейка заголовка: ручка перетаскивания и ручка изменения ширины.
 * Ключ колонки приходит через data-атрибут — он проходит в DOM без
 * предупреждений React, в отличие от произвольного пропса.
 */
function HeaderCell(
  props: ThHTMLAttributes<HTMLTableCellElement> & { 'data-col-key'?: string },
) {
  const api = useContext(HeaderContext);
  const columnKey = props['data-col-key'];

  // Колонки без заголовка (кнопки действий) не настраиваются: ухватиться
  // там не за что, и место у правого края для них единственно верное.
  if (!api || !columnKey) {
    return <th {...props} />;
  }

  const isOver = api.overKey === columnKey && api.draggingKey !== columnKey;
  const isResizing = api.resizingKey === columnKey;
  const className = [props.className, 'gsm-th-interactive', isOver ? 'gsm-th-over' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <th
      {...props}
      className={className}
      // Пока тянут ширину, перетаскивание колонки должно быть выключено:
      // иначе браузер начнёт перенос вместо изменения размера.
      draggable={!api.resizingKey}
      onDragStart={(event) => {
        // Без данных в dataTransfer Firefox не начинает перетаскивание.
        event.dataTransfer.setData('text/plain', columnKey);
        event.dataTransfer.effectAllowed = 'move';
        api.begin(columnKey);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        api.hover(columnKey);
      }}
      onDrop={(event) => {
        event.preventDefault();
        api.drop(columnKey);
      }}
      onDragEnd={api.end}
    >
      {props.children}
      <span
        className={`gsm-th-resizer${isResizing ? ' gsm-th-resizer--active' : ''}`}
        role="presentation"
        onMouseDown={(event) => {
          // Иначе начнётся перетаскивание колонки, а не изменение ширины.
          event.stopPropagation();
          event.preventDefault();
          api.startResize(columnKey, event);
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </th>
  );
}

export interface StickyTableProps<RecordType> extends TableProps<RecordType> {
  /**
   * Идентификатор раскладки. Нужен только там, где на одном экране
   * несколько таблиц со схожим набором колонок; иначе вычисляется сам.
   */
  columnsKey?: string;
}

export function StickyTable<RecordType extends object>({
  columnsKey,
  columns,
  components,
  ...props
}: StickyTableProps<RecordType>) {
  const { offsetHeader, registerReset } = useTableCard();
  const { pathname } = useLocation();

  /*
    Ключи считаются один раз по ИСХОДНОМУ порядку и дальше носятся вместе с
    колонкой. У колонки без key и dataIndex ключ выводится из позиции, а после
    перестановки позиция другая — пересчёт на переставленном списке дал бы
    другие ключи, и сопоставление рассыпалось бы.
  */
  const entries = useMemo(
    () =>
      (columns ?? []).map((column, index) => ({
        key: columnKeyOf(column as ColumnLike, index),
        column,
      })),
    [columns],
  );
  const keys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const signature = keys.join('|');
  const storageId = `${STORAGE_PREFIX}${columnsKey ?? `${pathname}:${digest(signature)}`}`;

  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const layoutRef = useRef<Layout>(EMPTY_LAYOUT);

  layoutRef.current = layout;

  useEffect(() => {
    setLayout(readLayout(storageId, signature.split('|')));
  }, [storageId, signature]);

  const persist = (next: Layout): void => {
    setLayout(next);
    try {
      localStorage.setItem(storageId, JSON.stringify(next));
    } catch {
      // Переполненное или недоступное хранилище — не повод ломать настройку.
    }
  };

  const effectiveOrder = layout.order ?? keys;

  const orderedEntries = useMemo(() => {
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    return effectiveOrder
      .map((key) => byKey.get(key))
      .filter((entry): entry is (typeof entries)[number] => entry !== undefined);
  }, [entries, effectiveOrder]);

  const isCustomised =
    (layout.order !== null && layout.order.join('|') !== signature) ||
    Object.keys(layout.widths).length > 0;

  // Стабильная ссылка: функция уходит в зависимости эффекта ниже.
  const reset = useCallback((): void => {
    setLayout(EMPTY_LAYOUT);
    try {
      localStorage.removeItem(storageId);
    } catch {
      // См. выше: недоступное хранилище не должно ломать сброс на экране.
    }
  }, [storageId]);

  /*
    Кнопка сброса живёт в шапке карточки, а не над таблицей: появляясь и
    исчезая над таблицей, она сдвигала бы содержимое вниз после каждой
    перестановки колонки.
  */
  useEffect(() => {
    if (!registerReset) return;
    registerReset(isCustomised ? reset : null);
    return () => registerReset(null);
  }, [registerReset, isCustomised, reset]);

  const headerApi: HeaderApi = {
    draggingKey,
    overKey,
    resizingKey,
    begin: (key) => {
      draggingRef.current = key;
      setDraggingKey(key);
    },
    hover: (key) => setOverKey(key),
    drop: (target) => {
      const source = draggingRef.current;
      draggingRef.current = null;
      setDraggingKey(null);
      setOverKey(null);
      if (!source || source === target) return;

      const next = [...effectiveOrder];
      const from = next.indexOf(source);
      const to = next.indexOf(target);
      if (from < 0 || to < 0) return;
      next.splice(from, 1);
      next.splice(to, 0, source);
      persist({ ...layoutRef.current, order: next });
    },
    end: () => {
      draggingRef.current = null;
      setDraggingKey(null);
      setOverKey(null);
    },
    startResize: (key, event) => {
      const cell = (event.target as HTMLElement).closest('th');
      if (!cell) return;

      const startX = event.clientX;
      const startWidth = cell.getBoundingClientRect().width;
      setResizingKey(key);

      // Слушатели на документе, а не на ячейке: курсор при быстром движении
      // выходит за её пределы, и события ушли бы мимо.
      const onMove = (move: MouseEvent): void => {
        const width = Math.max(MIN_WIDTH, Math.round(startWidth + move.clientX - startX));
        setLayout((current) => ({ ...current, widths: { ...current.widths, [key]: width } }));
      };

      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('gsm-resizing');
        setResizingKey(null);
        // В хранилище пишем один раз по отпусканию, а не на каждый пиксель.
        persist(layoutRef.current);
      };

      // Курсор изменения размера на всё время перетаскивания, где бы он ни был.
      document.body.classList.add('gsm-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
  };

  const preparedColumns = columns
    ? orderedEntries.map(({ key, column }) => {
        const typed = column as ColumnLike;
        const width = layout.widths[key] ?? typed.width;

        if (!typed.title) return width === typed.width ? column : { ...column, width };

        return {
          ...column,
          width,
          onHeaderCell: () => ({ 'data-col-key': key }) as never,
        };
      })
    : columns;

  /*
    Запасной вариант для таблиц вне карточки списка: там кнопке сброса негде
    жить, кроме подвала. Подвал под таблицей — он её вниз не сдвигает.
  */
  const footer: (() => ReactNode) | undefined =
    !registerReset && isCustomised
      ? () => (
          <div className="gsm-columns-reset">
            <button type="button" onClick={reset}>
              Вернуть исходный порядок и ширину колонок
            </button>
          </div>
        )
      : undefined;

  return (
    <HeaderContext.Provider value={headerApi}>
      <Table<RecordType>
        sticky={{ offsetHeader }}
        /*
          Компактные строки. По умолчанию Ant Design отводит на ячейку 16
          пикселей сверху и снизу — для учётной системы, где на экран нужно
          уместить как можно больше строк, это расточительно. Размер шрифта
          при этом не меняется, читаемость прежняя.
          Задано до распространения props: страница может вернуть себе
          просторный вариант, передав size явно.
        */
        size="small"
        /*
          Широкая таблица прокручивается внутри себя, а не растягивает страницу.
          Без этого страница уезжала вбок, и первые колонки — гаражный номер и
          госномер — оказывались под боковым меню.
          Задано до распространения props: странице оставлена возможность
          переопределить прокрутку своим значением.
        */
        scroll={{ x: 'max-content' }}
        footer={footer}
        {...props}
        columns={preparedColumns}
        components={{
          ...components,
          header: { ...components?.header, cell: HeaderCell },
        }}
      />
    </HeaderContext.Provider>
  );
}
