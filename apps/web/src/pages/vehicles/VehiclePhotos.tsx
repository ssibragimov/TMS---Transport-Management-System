import { DeleteOutlined, StarFilled, StarOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Empty,
  Image,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { RcFile } from 'antd/es/upload';
import dayjs from 'dayjs';
import { PERMISSIONS } from '@gsm/shared';

import { api, errorMessage } from '@/api/client';
import { useApiMutation, useAuthedImage } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fmt } from '@/lib/labels';

interface PhotoRow {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isPrimary: boolean;
  caption: string | null;
  createdAt: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Отдельный компонент: каждая картинка тянется своим авторизованным запросом. */
function PhotoThumb({ vehicleId, photo }: { vehicleId: number; photo: PhotoRow }) {
  const src = useAuthedImage(`/vehicles/${vehicleId}/photos/${photo.id}/content`);

  if (!src) {
    return (
      <div
        style={{
          width: '100%',
          height: 160,
          background: '#f5f5f5',
          display: 'grid',
          placeItems: 'center',
          color: '#999',
        }}
      >
        загрузка…
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={photo.caption ?? photo.fileName}
      style={{ width: '100%', height: 160, objectFit: 'cover' }}
    />
  );
}

export function VehiclePhotos({ vehicleId }: { vehicleId: number }) {
  const { can } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const manage = can(PERMISSIONS.VEHICLE_UPDATE);

  const photos = useQuery({
    queryKey: ['vehicle-photos', vehicleId],
    queryFn: async () =>
      (await api.get<PhotoRow[]>(`/vehicles/${vehicleId}/photos`)).data,
  });

  const invalidate = [['vehicle-photos'], ['vehicles']];

  const setPrimary = useApiMutation(
    async (photoId: number) =>
      (await api.patch(`/vehicles/${vehicleId}/photos/${photoId}/primary`)).data,
    { successMessage: 'Главное фото изменено', invalidate },
  );

  const remove = useApiMutation(
    async (photoId: number) =>
      (await api.delete(`/vehicles/${vehicleId}/photos/${photoId}`)).data,
    { successMessage: 'Фотография удалена', invalidate },
  );

  /**
   * Загрузка идёт через customRequest, а не встроенным action антовского
   * Upload: тому нужен URL без заголовков, а наш эндпоинт требует токен.
   */
  const upload = async (file: RcFile): Promise<void> => {
    const form = new FormData();
    form.append('file', file);

    try {
      await api.post(`/vehicles/${vehicleId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      void message.success('Фотография загружена');
      await queryClient.invalidateQueries({ queryKey: ['vehicle-photos'] });
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  return (
    <>
      {manage && (
        <Upload
          accept="image/jpeg,image/png,image/webp,image/heic"
          showUploadList={false}
          multiple
          beforeUpload={(file) => {
            // Проверка размера на клиенте — чтобы не гонять 50 МБ по сети
            // ради отказа сервера. Сервер всё равно проверяет повторно.
            if (file.size > MAX_BYTES) {
              void message.error(`${file.name}: файл больше 10 МБ`);
              return Upload.LIST_IGNORE;
            }
            void upload(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} style={{ marginBottom: 16 }}>
            Загрузить фотографии
          </Button>
        </Upload>
      )}

      {photos.data && photos.data.length === 0 && (
        <Empty description="Фотографий нет" />
      )}

      <Image.PreviewGroup>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 12,
          }}
        >
          {(photos.data ?? []).map((photo) => (
            <Card
              key={photo.id}
              size="small"
              styles={{ body: { padding: 8 } }}
              cover={<PhotoThumb vehicleId={vehicleId} photo={photo} />}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  {photo.isPrimary ? (
                    <Tag color="gold" icon={<StarFilled />}>
                      главное
                    </Tag>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(photo.createdAt).format('DD.MM.YYYY')}
                    </Typography.Text>
                  )}
                  {manage && (
                    <Space size={0}>
                      {!photo.isPrimary && (
                        <Tooltip title="Сделать главным">
                          <Button
                            type="text"
                            size="small"
                            icon={<StarOutlined />}
                            onClick={() => setPrimary.mutate(photo.id)}
                          />
                        </Tooltip>
                      )}
                      <Popconfirm
                        title="Удалить фотографию?"
                        okText="Удалить"
                        cancelText="Отмена"
                        onConfirm={() => remove.mutate(photo.id)}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  )}
                </Space>
                <Typography.Text ellipsis style={{ fontSize: 12 }} title={photo.fileName}>
                  {photo.fileName}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {fmt(photo.sizeBytes / 1024)} КБ
                </Typography.Text>
              </Space>
            </Card>
          ))}
        </div>
      </Image.PreviewGroup>
    </>
  );
}
