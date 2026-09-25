import {
  DeleteOutlined,
  PhoneOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Col,
  Collapse,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { PERMISSIONS, SYSTEM_ROLES } from '@gsm/shared';

import { EntityAuditLog } from '@/components/EntityAuditLog';
import { errorMessage } from '@/api/client';
import { UserAvatar } from '@/components/UserAvatar';
import { AVATAR_ACCEPT, cropToSquare } from '@/lib/image';

import { CardTitle } from '@/components/EntityId';
import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';

export interface UserDetail {
  id: number;
  email: string;
  fullName: string;
  /** Служебный внутренний номер телефона: четыре цифры. */
  internalNumber: string | null;
  /** Ключ фотографии в хранилище. null — снимка нет. */
  photoKey: string | null;
  phone: string | null;
  locale: string;
  status: string;
  bypassRls: boolean;
  defaultOfficeId: number | null;
  offices: Array<{ office: { id: number; code: string; nameRu: string } }>;
  roles: Array<{ officeId: number | null; role: { id: number; code: string; name: string } }>;
}

interface RoleOption {
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
}

interface Props {
  open: boolean;
  /** null — создание нового пользователя */
  initial: UserDetail | null;
  onClose: () => void;
  /** При создании сразу отметить «суперадминистратор платформы» (вкладка «Платформа») */
  presetPlatformAdmin?: boolean;
}

export function UserFormModal({ open, initial, onClose, presetPlatformAdmin }: Props) {
  const { t } = useTranslation();

  const [form] = Form.useForm();
  const { user: me, refreshProfile, can } = useAuth();
  const canPlatform = can(PERMISSIONS.PLATFORM_MANAGE);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  // Имя `user` занято под текущего пользователя в остальном файле —
  // сохраняем прежнее обращение к списку доступных офисов.
  const user = me;

  const roles = useQuery({
    queryKey: ['roles'],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<RoleOption[]>('/users/roles')).data,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();

    if (initial) {
      // Роли раскладываются по офисам: в форме одна строка на офис.
      const byOffice = new Map<number, string[]>();
      for (const assignment of initial.roles) {
        if (assignment.officeId === null) continue;
        // Суперадминистратор — отметка «платформы», а не роль офиса.
        if (assignment.role.code === SYSTEM_ROLES.SUPER_ADMIN) continue;
        const list = byOffice.get(assignment.officeId) ?? [];
        list.push(assignment.role.code);
        byOffice.set(assignment.officeId, list);
      }

      form.setFieldsValue({
        fullName: initial.fullName,
        internalNumber: initial.internalNumber ?? undefined,
        phone: initial.phone ?? undefined,
        locale: initial.locale,
        status: initial.status,
        defaultOfficeId: initial.defaultOfficeId ?? undefined,
        platformAdmin: initial.roles.some((r) => r.role.code === SYSTEM_ROLES.SUPER_ADMIN),
        offices: initial.offices.map((entry) => ({
          officeId: entry.office.id,
          roleCodes: byOffice.get(entry.office.id) ?? [],
        })),
      });
    } else {
      form.setFieldsValue({
        locale: 'ru',
        status: 'ACTIVE',
        platformAdmin: Boolean(presetPlatformAdmin),
        offices: [{ officeId: user?.activeOffice.id, roleCodes: [] }],
      });
    }
  }, [open, initial, form, user, presetPlatformAdmin]);

  /**
   * Фотография сохраняется отдельным запросом, а не вместе с формой.
   *
   * Причина: файл уходит как multipart, а остальные поля — как JSON, и
   * смешивать их в одном запросе значило бы переводить всю форму на
   * multipart ради одного необязательного поля. Сохранение снимка сразу
   * по выбору файла ещё и удобнее: результат виден, не нажимая «Сохранить».
   */
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    setPhotoKey(initial?.photoKey ?? null);
  }, [initial, open]);

  const refreshPhoto = async (nextKey: string | null): Promise<void> => {
    setPhotoKey(nextKey);
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    // Свой снимок в шапке обновится только после перезапроса профиля.
    if (initial?.id === me?.id) await refreshProfile();
  };

  const uploadPhoto = async (file: File): Promise<void> => {
    if (!initial) return;
    setPhotoBusy(true);
    try {
      const square = await cropToSquare(file);
      const form = new FormData();
      form.append('file', square.blob, square.fileName);

      const { data } = await api.post<{ photoKey: string | null }>(
        `/users/${initial.id}/photo`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      void message.success(t('Фотография загружена'));
      await refreshPhoto(data.photoKey);
    } catch (error) {
      void message.error(
        error instanceof Error && !axios.isAxiosError(error)
          ? error.message
          : errorMessage(error),
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async (): Promise<void> => {
    if (!initial) return;
    try {
      await api.delete(`/users/${initial.id}/photo`);
      void message.success(t('Фотография удалена'));
      await refreshPhoto(null);
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (isEdit) {
        const { data } = await api.patch(`/users/${initial!.id}`, {
          fullName: values.fullName,
          internalNumber: values.internalNumber ?? '',
          phone: values.phone,
          locale: values.locale,
          status: values.status,
          offices: values.offices,
          defaultOfficeId: values.defaultOfficeId,
          // Отметку может менять только управляющий платформой.
          ...(canPlatform && { platformAdmin: Boolean(values.platformAdmin) }),
        });
        return data;
      }
      const { platformAdmin, ...rest } = values;
      const { data } = await api.post('/users', {
        ...rest,
        ...(canPlatform && platformAdmin ? { platformAdmin: true } : {}),
      });
      return data;
    },
    {
      successMessage: isEdit ? 'Пользователь обновлён' : 'Пользователь создан',
      invalidate: [['users']],
    },
  );

  const officeOptions = (user?.availableOffices ?? []).map((office) => ({
    value: office.id,
    label: `${office.code} — ${office.name}`,
  }));

  // Суперадминистратор выдаётся отметкой выше, а не ролью отдельного офиса.
  const roleOptions = (roles.data ?? [])
    .filter((role) => role.code !== SYSTEM_ROLES.SUPER_ADMIN)
    .map((role) => ({
      value: role.code,
      label: role.name,
    }));

  return (
    <Modal
      open={open}
      width={780}
      title={<CardTitle title={isEdit ? `Пользователь: ${initial?.fullName}` : 'Новый пользователь'} id={initial?.id} />}
      okText={t("Сохранить")}
      cancelText={t("Отмена")}
      confirmLoading={save.isPending}
      onCancel={onClose}
      onOk={() => {
        void form.validateFields().then((values) => {
          save.mutate(values, { onSuccess: onClose });
        });
      }}
    >
      {initial?.bypassRls && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Техническая учётная запись"
          description={t("У этого пользователя включён обход изоляции офисов. Он видит данные всех аэропортов. Признак не редактируется через интерфейс.")}
        />
      )}

      {/*
        Порядок полей: ФИО → почта → служебный номер → личный телефон →
        язык → статус. Сначала кто это, потом как с ним связаться, и только
        потом настройки учётки.

        Четыре коротких поля стоят одной ровной строкой по четверти ширины.
        Разной ширины колонки и разрывы между рядами делали карточку рваной.
      */}
      {/* Фотография — только у существующей записи: файл кладётся по её
          идентификатору, которого до сохранения ещё нет. */}
      {isEdit && initial && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <UserAvatar
            userId={initial.id}
            fullName={initial.fullName}
            photoKey={photoKey}
            size={72}
          />
          <Space direction="vertical" size={4}>
            <Space>
              <Upload
                accept={AVATAR_ACCEPT}
                showUploadList={false}
                beforeUpload={(file) => {
                  void uploadPhoto(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={photoBusy}>
                  {photoKey ? t('Заменить фото') : t('Загрузить фото')}
                </Button>
              </Upload>
              {photoKey && (
                <Popconfirm
                  title={t('Удалить фотографию?')}
                  okText={t('Удалить')}
                  cancelText={t('Отмена')}
                  onConfirm={() => void removePhoto()}
                >
                  <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('Снимок обрезается по центру в квадрат. JPEG, PNG или WebP.')}
            </Typography.Text>
          </Space>
        </div>
      )}

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="fullName"
              label={t("ФИО")}
              rules={[{ required: true, message: t("Обязательное поле") }]}
            >
              <Input placeholder={t("Иванов Иван Иванович")} />
            </Form.Item>
          </Col>
          <Col span={12}>
            {isEdit ? (
              <Form.Item label={t("Электронная почта")}>
                <Input value={initial?.email} disabled />
              </Form.Item>
            ) : (
              <Form.Item
                name="email"
                label={t("Электронная почта")}
                rules={[
                  { required: true, message: t("Обязательное поле") },
                  { type: 'email', message: t("Некорректный адрес") },
                ]}
              >
                <Input autoComplete="off" />
              </Form.Item>
            )}
          </Col>
        </Row>

        {/* Пароль задаётся только при создании и стоит отдельной строкой,
            чтобы не разрывать ряд контактов и настроек. */}
        {!isEdit && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="password"
                label={t("Пароль")}
                rules={[
                  { required: true, message: t("Обязательное поле") },
                  { min: 8, message: t("Не короче 8 символов") },
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              name="internalNumber"
              label={t("Основной")}
              tooltip={t("Служебный внутренний номер телефона — четыре цифры. По нему сотрудника набирают внутри предприятия, поэтому он идёт раньше личного. Один номер может быть закреплён за несколькими сотрудниками.")}
              rules={[{ pattern: /^\d{4}$/, message: t("Ровно четыре цифры") }]}
            >
              <Input
                placeholder="1042"
                maxLength={4}
                inputMode="numeric"
                addonBefore={<PhoneOutlined />}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="phone"
              label={t("Телефон")}
              tooltip={t("Личный номер сотрудника")}
            >
              <Input placeholder="+998 90 123-45-67" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="locale" label={t("Язык")}>
              <Select
                options={[
                  { value: 'ru', label: t("Русский") },
                  { value: 'uz', label: 'O‘zbekcha' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="status" label={t("Статус")}>
              <Select
                options={[
                  { value: 'ACTIVE', label: t("Активен") },
                  { value: 'INVITED', label: t("Приглашён") },
                  { value: 'SUSPENDED', label: t("Заблокирован") },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          {t("Доступ к офисам и роли")}
        </Divider>
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          {t("Роль действует в конкретном офисе. Один человек может быть диспетчером в Ташкенте и наблюдателем в Самарканде — это две отдельные строки.")}
          {' '}
          {t("Суперадминистратор платформы отмечается отдельно и видит все офисы всех организаций, в том числе созданные позже.")}
        </Typography.Paragraph>

        {canPlatform && (
          <Form.Item
            name="platformAdmin"
            valuePropName="checked"
            extra={t("Полный доступ ко всем организациям и офисам, управление организациями и офисами. Ниже укажите хотя бы один офис — в него человек попадает после входа.")}
          >
            <Checkbox>{t("Суперадминистратор платформы")}</Checkbox>
          </Form.Item>
        )}

        <Form.List
          name="offices"
          rules={[
            {
              validator: async (_, value: unknown[]) => {
                if (!value || value.length === 0) {
                  throw new Error('Назначьте хотя бы один офис');
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map((field) => (
                <Row key={field.key} gutter={8} style={{ marginBottom: 8 }}>
                  <Col span={9}>
                    <Form.Item
                      name={[field.name, 'officeId']}
                      rules={[{ required: true, message: t("Выберите офис") }]}
                      noStyle
                    >
                      <Select
                        showSearch
                        style={{ width: '100%' }}
                        optionFilterProp="label"
                        placeholder={t("Офис")}
                        options={officeOptions}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={13}>
                    <Form.Item
                      name={[field.name, 'roleCodes']}
                      rules={[
                        ({ getFieldValue }) => ({
                          // Суперадминистратору платформы роль в офисе не нужна.
                          required: !getFieldValue('platformAdmin'),
                          message: t("Выберите роли"),
                        }),
                      ]}
                      noStyle
                    >
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        allowClear
                        placeholder={t("Роли в этом офисе")}
                        loading={roles.isLoading}
                        options={roleOptions}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </Col>
                </Row>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                style={{ width: '100%' }}
                onClick={() => add({ roleCodes: [] })}
              >
                {t("Добавить офис")}
              </Button>
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>

        {/*
          Список офисов по умолчанию строится из уже назначенных: выбрать
          стартовым офис, к которому нет доступа, невозможно — сервер это
          отвергнет, и лучше не давать такой возможности в форме.
        */}
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.offices !== next.offices}>
          {({ getFieldValue }) => {
            const assigned = ((getFieldValue('offices') ?? []) as Array<{ officeId?: number }>)
              .map((entry) => entry?.officeId)
              .filter((id): id is number => typeof id === 'number');

            return (
              <Form.Item
                name="defaultOfficeId"
                label={t("Офис по умолчанию")}
                tooltip={t("В него пользователь попадает сразу после входа")}
                style={{ marginTop: 16 }}
              >
                <Select
                  allowClear
                  placeholder={t("Первый из назначенных")}
                  options={officeOptions.filter((option) => assigned.includes(option.value))}
                />
              </Form.Item>
            );
          }}
        </Form.Item>
      </Form>

      {/* Журнал свёрнут по умолчанию: карточка пользователя — это прежде
          всего форма, и раскрытая таблица истории оттеснила бы поля вниз. */}
      {isEdit && initial && (
        <Collapse
          ghost
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'audit',
              label: t('Журнал действий'),
              children: <EntityAuditLog entity="User" entityId={initial.id} limit={30} />,
            },
          ]}
        />
      )}
    </Modal>
  );
}
