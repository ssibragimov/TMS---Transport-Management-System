/**
 * Подготовка изображения к загрузке.
 *
 * Аватар обрезается в квадрат здесь, на клиенте, а не на сервере. Причина
 * практическая: приведение картинки к квадрату на стороне API потребовало бы
 * нативной библиотеки обработки изображений (sharp) — с бинарной сборкой под
 * каждую платформу и заметным весом в образе. Ради одной операции над
 * аватаром это несоразмерно, а браузер умеет то же самое штатным canvas.
 *
 * Плата за решение: сервер принимает файл как есть и на квадратность его не
 * проверяет. Для внутренней системы с единственным клиентом это приемлемо;
 * если появится мобильное приложение или интеграция, проверку размеров
 * придётся добавить на сервере.
 */

/** Сторона готового снимка. 512 хватает и для крупного портрета в карточке. */
const OUTPUT_SIZE = 512;

/** Качество JPEG. 0.9 — снимок без видимых артефактов при разумном весе. */
const JPEG_QUALITY = 0.9;

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

export interface SquareImage {
  blob: Blob;
  /** Имя с расширением по итоговому формату, а не по исходному. */
  fileName: string;
}

/**
 * Обрезает изображение по центру до квадрата и уменьшает до OUTPUT_SIZE.
 *
 * Обрезка именно центральная: у портретов лицо почти всегда в середине кадра,
 * а спрашивать область у пользователя означало бы полноценный редактор кадра —
 * это отдельная задача.
 */
export async function cropToSquare(file: File): Promise<SquareImage> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Не удалось прочитать изображение. Поддерживаются JPEG, PNG и WebP.');
  });

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - side) / 2;
    const sourceY = (bitmap.height - side) / 2;

    // Мелкий снимок не растягиваем: увеличение только добавит мыла.
    const target = Math.min(OUTPUT_SIZE, side);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает обработку изображений');

    // Белая подложка: PNG с прозрачностью иначе станет чёрным квадратом,
    // потому что JPEG альфа-канала не хранит.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, target, target);

    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, target, target);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('Не удалось подготовить изображение');

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return { blob, fileName: `${baseName}.jpg` };
  } finally {
    // Битмап держит память вне сборщика мусора — освобождаем явно.
    bitmap.close();
  }
}
