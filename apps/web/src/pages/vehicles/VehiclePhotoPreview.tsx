import { Image, Spin } from 'antd';
import { useState } from 'react';

import { useAuthedImage } from '@/api/hooks';

/**
 * Просмотр снимка техники прямо из списка.
 *
 * Картинка тянется только после нажатия: в таблице на 25 строк
 * предзагрузка всех снимков — это 25 лишних запросов ради колонки,
 * в которую чаще всего не заходят.
 */
interface Props {
  vehicleId: number;
  photoId: number;
  open: boolean;
  onClose: () => void;
}

export function VehiclePhotoPreview({ vehicleId, photoId, open, onClose }: Props) {
  const src = useAuthedImage(open ? `/vehicles/${vehicleId}/photos/${photoId}/content` : null);

  if (!open) return null;

  if (!src) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(0, 0, 0, 0.45)',
        }}
        onClick={onClose}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Image
      style={{ display: 'none' }}
      src={src}
      preview={{
        visible: true,
        src,
        onVisibleChange: (visible) => {
          if (!visible) onClose();
        },
      }}
    />
  );
}

/** Состояние «какой снимок сейчас открыт» — чтобы страница не держала его руками. */
export function usePhotoPreview() {
  const [target, setTarget] = useState<{ vehicleId: number; photoId: number } | null>(null);
  return {
    target,
    open: (vehicleId: number, photoId: number) => setTarget({ vehicleId, photoId }),
    close: () => setTarget(null),
  };
}
