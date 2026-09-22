import { Image, Spin } from 'antd';
import { useState } from 'react';

import { useAuthedImage } from '@/api/hooks';

/**
 * Просмотр фото/вложения нарушения прямо из списка — тот же приём,
 * что и у снимков техники (см. VehiclePhotoPreview): картинка тянется
 * только после клика, а не для всех строк таблицы сразу.
 */
interface Props {
  violationId: number;
  open: boolean;
  onClose: () => void;
}

export function ViolationPhotoPreview({ violationId, open, onClose }: Props) {
  const src = useAuthedImage(open ? `/violations/${violationId}/photo` : null);

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

/** Состояние «какое фото сейчас открыто» — чтобы страница не держала его руками. */
export function useViolationPhotoPreview() {
  const [target, setTarget] = useState<number | null>(null);
  return {
    target,
    open: (violationId: number) => setTarget(violationId),
    close: () => setTarget(null),
  };
}
