import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePaged } from '@/api/hooks';
import { createdAtColumn } from '@/components/createdAtColumn';
import { StickyTable } from '@/components/StickyTable';
import { UserAvatar } from '@/components/UserAvatar';
import { UserFormModal, type UserDetail } from '@/pages/users/UserFormModal';

type Row = UserDetail & { lastLoginAt: string | null };

/**
 * Суперадминистраторы платформы: видят все организации и офисы и работают
 * в любом из них. Список не зависит от активного офиса.
 */
export function PlatformAdminsPanel() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const query = usePaged<Row>(['users', 'platform-admins'], '/users', {
    page,
    pageSize,
    platformAdmins: true,
  });

  return (
    <>
      <Typography.Paragraph type="secondary">
        {t(
          'Суперадминистратор платформы видит все организации и офисы, в том числе созданные позже, и может переключаться между ними. Администратор офиса работает только в рамках своего офиса. Статус выдаётся отметкой в карточке пользователя.',
        )}
      </Typography.Paragraph>

      <Button
        type="primary"
        icon={<PlusOutlined />}
        style={{ marginBottom: 12 }}
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        {t('Добавить суперадминистратора')}
      </Button>

      <StickyTable<Row>
        rowKey="id"
        rowNumbers
        size="small"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.meta.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${t('Всего:')} ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          {
            title: t('ФИО'),
            dataIndex: 'fullName',
            render: (name: string, row) => (
              <Space>
                <UserAvatar
                  userId={row.id}
                  fullName={name}
                  photoKey={row.photoKey}
                  size={28}
                />
                <span>{name}</span>
              </Space>
            ),
          },
          { title: t('Почта'), dataIndex: 'email', width: 260 },
          {
            title: t('Статус'),
            dataIndex: 'status',
            width: 130,
            render: (value: string) => (
              <Tag
                color={
                  value === 'ACTIVE' ? 'green' : value === 'SUSPENDED' ? 'red' : 'gold'
                }
              >
                {t(
                  value === 'ACTIVE'
                    ? 'Активен'
                    : value === 'SUSPENDED'
                      ? 'Заблокирован'
                      : 'Приглашён',
                )}
              </Tag>
            ),
          },
          {
            title: t('Последний вход'),
            dataIndex: 'lastLoginAt',
            width: 150,
            render: (value: string | null) =>
              value ? dayjs(value).format('DD.MM.YYYY HH:mm') : t('ни разу'),
          },
          createdAtColumn<Row>(t),
          {
            title: '',
            width: 70,
            render: (_: unknown, row: Row) => (
              <Tooltip title={t('Изменить')}>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                />
              </Tooltip>
            ),
          },
        ]}
      />

      <UserFormModal
        open={open}
        initial={editing}
        presetPlatformAdmin
        onClose={() => setOpen(false)}
      />
    </>
  );
}
