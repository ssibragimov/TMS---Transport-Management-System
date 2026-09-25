import { useEffect, useRef, useState } from 'react';

/**
 * Фотографии перрона на экране входа. Лежат в public/, а не импортом
 * из src/ — их четыре, они меняются редко и раздаются как есть, без
 * хеширования имени файла (see apps/web/public/map за тем же приёмом).
 */
const BASE = `${import.meta.env.BASE_URL}login/`;

/**
 * Кадры слева — горизонтальные, а рамка вертикальная, поэтому показывается
 * лишь часть снимка. `position` подобран так, чтобы в кадр попадал главный
 * объект: человек, экран или голограмма.
 */
const PHOTOS = [
  { src: `${BASE}photo-1.webp`, position: '28% center' },
  { src: `${BASE}photo-2.webp`, position: '22% center' },
  { src: `${BASE}photo-3.webp`, position: '62% center' },
];

const SLIDE_MS = 5000;

export function LoginPhotoCarousel() {
  const [active, setActive] = useState(0);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (reducedMotion.current) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % PHOTOS.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <div className="gsm-login-photos" aria-hidden>
        {PHOTOS.map(({ src, position }, index) => (
          <div
            key={src}
            className={`gsm-login-photo${index === active ? ' active' : ''}`}
            style={{ backgroundImage: `url(${src})`, backgroundPosition: position }}
          />
        ))}
      </div>
      <div className="gsm-login-veil" aria-hidden />
      {/*
        Полоса заполняется ровно за SLIDE_MS — так по точкам видно, сколько
        осталось до смены фото, а не просто «какая сейчас активна».
        Снятие и повторное добавление класса `on` при возврате на этот же
        слайд перезапускает CSS-анимацию заново — сбрасывать вручную не нужно.
      */}
      <div className="gsm-login-dots" aria-hidden>
        {PHOTOS.map(({ src }, index) => (
          <span key={src} className={index === active ? 'on' : ''}>
            <span className="gsm-login-dot-fill" style={{ animationDuration: `${SLIDE_MS}ms` }} />
          </span>
        ))}
      </div>
    </>
  );
}
