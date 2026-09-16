import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Slider, Space, Typography } from 'antd';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

import { cropImageToSquare } from '@/lib/cropImage';

interface PhotoCropModalProps {
  open: boolean;
  file: File | null;
  title: string;
  confirmLoading?: boolean;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
}

/**
 * Кроп в квадрат перед загрузкой. Без этого шага система обрезала бы
 * фото «на глаз» через CSS object-fit при каждом показе, и произвольное
 * фото могло обрезаться по лицу — здесь область выбирает сам пользователь,
 * а сохраняется уже готовый квадратный файл.
 */
export function PhotoCropModal({
  open,
  file,
  title,
  confirmLoading,
  onCancel,
  onConfirm,
}: PhotoCropModalProps) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Modal
      open={open}
      title={title}
      okText={t('Загрузить')}
      cancelText={t('Отмена')}
      confirmLoading={confirmLoading || cropping}
      okButtonProps={{ disabled: !area }}
      onCancel={onCancel}
      onOk={async () => {
        if (!imageUrl || !area || !file) return;
        setCropping(true);
        try {
          const blob = await cropImageToSquare(imageUrl, area);
          onConfirm(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        } finally {
          setCropping(false);
        }
      }}
      width={480}
      destroyOnHidden
    >
      {imageUrl && (
        <>
          <div style={{ position: 'relative', width: '100%', height: 320, background: '#333', borderRadius: 8, overflow: 'hidden' }}>
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, croppedAreaPixels) => setArea(croppedAreaPixels)}
            />
          </div>
          <Space align="center" style={{ width: '100%', marginTop: 16 }}>
            <Typography.Text type="secondary">{t('Масштаб')}</Typography.Text>
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={setZoom}
              style={{ width: 300 }}
            />
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
            {t('Перетащите фото и настройте масштаб, чтобы выбрать область для квадратного снимка')}
          </Typography.Paragraph>
        </>
      )}
    </Modal>
  );
}
