import { Table } from 'antd';
import type { TableProps } from 'antd';
import {
  createContext,
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

import { useStickyOffset } from './TableCard';

/**
 * Таблица с закреплёнными заголовками и колонками, которые пользователь
 * переставляет мышью.
 *
 * Отдельный компонент, а не пропсы на каждой странице: отступ сверху зависит
 * от высоты шапки конкретной карточки, а порядок колонок нужно хранить и
 * восстанавливать — повторять это в десяти местах значит разъехаться в одном.
 *
 * Перетаскивание сделано на нативном HTML5 drag-and-drop, без внешней
 * библиотеки: задача — поменять местами ячейки заголовка, и тянуть ради
 * этого dnd-kit в сборку неоправданно.
 */

const STORAGE_PREFIX = 'gsm.columns.';

/**
 * Достаточно того, что есть у любой колонки. Конкретный ColumnType здесь не
 * нужен и только мешает: у группы колонок нет dataIndex.
 */
interface ColumnLike {
  key?: Key;
  dataIndex?: unknown;
  title?: unknown;
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

/**
 * Сохранённый порядок приводится к текущему набору колонок: исчезнувшие
 * отбрасываются, новые добавляются в конец. Иначе после доработки таблицы
 * пользователь с сохранённой раскладкой не увидел бы новую колонку вовсе.
 */
function reconcile(saved: string[], keys: string[]): string[] {
  const known = new Set(keys);
  const kept = saved.filter((key) => known.has(key));
  const missing = keys.filter((key) => !kept.includes(key));
  return [...kept, ...missing];
}

interface DragState {
  draggingKey: string | null;
  overKey: string | null;
  begin: (key: string) => void;
  hover: (key: string) => void;
  drop: (key: string) => void;
  end: () => void;
}

const DragContext = createContext<DragState | null>(null);

/**
 * Ячейка заголовка. Ключ колонки приходит через data-атрибут: он проходит
 * в DOM без предупреждений React, в отличие от произвольного пропса.
 */
function DraggableHeaderCell(
  props: ThHTMLAttributes<HTMLTableCellElement> & { 'data-col-key'?: string },
) {
  const drag = useContext(DragContext);
  const columnKey = props['data-col-key'];

  // Колонки без заголовка (значок фото, кнопки действий) не таскаются:
  // им нечего показать под курсором и незачем менять место.
  if (!drag || !columnKey) {
    return <th {...props} />;
  }

  const isOver = drag.overKey === columnKey && drag.draggingKey !== columnKey;
  const className = [props.className, 'gsm-th-draggable', isOver ? 'gsm-th-over' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <th
      {...props}
      className={className}
      draggable
      onDragStart={(event) => {
        // Без этого Firefox не начинает перетаскивание.
        event.dataTransfer.setData('text/plain', columnKey);
        event.dataTransfer.effectAllowed = 'move';
        drag.begin(columnKey);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        drag.hover(columnKey);
      }}
      onDrop={(event) => {
        event.preventDefault();
        drag.drop(columnKey);
      }}
      onDragEnd={drag.end}
    />
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
  const offsetHeader = useStickyOffset();
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

  const [order, setOrder] = useState<string[] | null>(null);
  const draggingRef = useRef<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageId);
      setOrder(raw ? reconcile(JSON.parse(raw) as string[], signature.split('|')) : null);
    } catch {
      // Испорченное значение в хранилище не должно ломать таблицу.
      setOrder(null);
    }
  }, [storageId, signature]);

  const applyOrder = (next: string[]): void => {
    setOrder(next);
    try {
      localStorage.setItem(storageId, JSON.stringify(next));
    } catch {
      // Переполненное или недоступное хранилище — не повод ломать перестановку.
    }
  };

  const effectiveOrder = order ?? keys;

  const orderedEntries = useMemo(() => {
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    return effectiveOrder
      .map((key) => byKey.get(key))
      .filter((entry): entry is (typeof entries)[number] => entry !== undefined);
  }, [entries, effectiveOrder]);

  const drag: DragState = {
    draggingKey,
    overKey,
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
      applyOrder(next);
    },
    end: () => {
      draggingRef.current = null;
      setDraggingKey(null);
      setOverKey(null);
    },
  };

  const isCustomised = order !== null && order.join('|') !== signature;

  const columnsWithDragProps = columns
    ? orderedEntries.map(({ key, column }) => {
        // Заголовок пустой — колонка служебная (кнопки действий),
        // переставлять её незачем и не за что ухватиться.
        if (!(column as ColumnLike).title) return column;

        return {
          ...column,
          onHeaderCell: () => ({ 'data-col-key': key }) as never,
        };
      })
    : columns;

  const resetBar: (() => ReactNode) | undefined = isCustomised
    ? () => (
        <div className="gsm-columns-reset">
          <button type="button" onClick={() => {
            setOrder(null);
            localStorage.removeItem(storageId);
          }}>
            Вернуть исходный порядок колонок
          </button>
        </div>
      )
    : undefined;

  return (
    <DragContext.Provider value={drag}>
      <Table<RecordType>
        sticky={{ offsetHeader }}
        /*
          Широкая таблица прокручивается внутри себя, а не растягивает страницу.
          Без этого страница уезжала вбок, и первые колонки — гаражный номер и
          госномер — оказывались под боковым меню.
          Задано до распространения props: странице оставлена возможность
          переопределить прокрутку своим значением.
        */
        scroll={{ x: 'max-content' }}
        title={resetBar}
        {...props}
        columns={columnsWithDragProps}
        components={{
          ...components,
          header: { ...components?.header, cell: DraggableHeaderCell },
        }}
      />
    </DragContext.Provider>
  );
}
