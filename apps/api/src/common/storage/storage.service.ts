import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

export interface StoredFile {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Хранилище файлов: фотографии техники, сканы документов, накладные.
 *
 * Сейчас реализован локальный диск. Это осознанный выбор для первого этапа:
 * MinIO поднимается только вместе с Docker, а разворачивать систему приходится
 * в том числе там, где Docker недоступен. Интерфейс намеренно узкий — save /
 * read / remove — чтобы замена на S3 свелась к одному классу.
 *
 * Файлы НЕ раздаются статикой: доступ к ним идёт через API с проверкой прав
 * и принадлежности офису. Прямая раздача из папки обошла бы изоляцию офисов —
 * достаточно было бы угадать ссылку.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root = resolve(process.cwd(), '../../storage');

  /** Разрешённые типы изображений. Список белый, а не чёрный. */
  private static readonly IMAGE_MIME = new Map<string, string>([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/heic', '.heic'],
  ]);

  static readonly MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  /**
   * Сохраняет изображение.
   *
   * @param scope префикс ключа: `vehicles/12` — раскладка по сущностям,
   *              чтобы при переезде на S3 не разбирать плоскую свалку.
   */
  async saveImage(
    scope: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<StoredFile> {
    const extension = StorageService.IMAGE_MIME.get(file.mimetype);
    if (!extension) {
      throw new BadRequestException({
        code: 'storage.unsupported_type',
        message: 'Поддерживаются только изображения JPEG, PNG, WebP и HEIC',
      });
    }
    if (file.size > StorageService.MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        code: 'storage.file_too_large',
        message: `Файл больше ${StorageService.MAX_IMAGE_BYTES / 1024 / 1024} МБ`,
      });
    }

    // Имя файла на диске генерируется, а не берётся из загрузки: исходное
    // имя может содержать что угодно, включая обход каталога.
    const key = `${this.sanitizeScope(scope)}/${randomUUID()}${extension}`;
    const target = this.resolveKey(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.buffer);

    return {
      key,
      fileName: this.safeFileName(file.originalname, extension),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  createReadStream(key: string): { stream: Readable; path: string } {
    const path = this.resolveKey(key);
    if (!existsSync(path)) {
      throw new NotFoundException({
        code: 'storage.file_not_found',
        message: 'Файл не найден в хранилище',
      });
    }
    return { stream: createReadStream(path), path };
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      // Отсутствие файла на диске не должно мешать удалить запись в БД:
      // рассинхронизация возможна после восстановления из резервной копии.
      this.logger.warn(`Не удалось удалить файл ${key}: ${(error as Error).message}`);
    }
  }

  /**
   * Превращает ключ в путь и проверяет, что он не вышел за пределы хранилища.
   * Без этой проверки ключ вида `../../.env` отдал бы файл конфигурации.
   */
  private resolveKey(key: string): string {
    const path = resolve(join(this.root, normalize(key)));
    if (!path.startsWith(this.root + sep)) {
      throw new BadRequestException({
        code: 'storage.invalid_key',
        message: 'Некорректный ключ файла',
      });
    }
    return path;
  }

  private sanitizeScope(scope: string): string {
    return scope.replace(/[^a-zA-Z0-9/_-]/g, '');
  }

  private safeFileName(original: string, fallbackExtension: string): string {
    const base = original.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
    return base.length > 0 ? base : `image${extname(original) || fallbackExtension}`;
  }
}
