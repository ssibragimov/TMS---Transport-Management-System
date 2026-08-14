import { Table } from 'antd';
import type { TableProps } from 'antd';

import { useStickyOffset } from './TableCard';

/**
 * Таблица с заголовками, закреплёнными под панелью фильтров.
 *
 * Отдельный компонент, а не проп `sticky` на каждой странице: отступ сверху
 * зависит от высоты шапки конкретной карточки, и повторять этот расчёт в
 * десяти местах — гарантированно разъехаться в одном из них.
 */
export function StickyTable<RecordType extends object>(props: TableProps<RecordType>) {
  const offsetHeader = useStickyOffset();

  return (
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
      {...props}
    />
  );
}
