import { Alert, Button, Form, Input, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { LocaleFlag } from '@/components/LocaleFlag';
import { LoginPhotoCarousel } from '@/components/LoginPhotoCarousel';
import i18n, { SUPPORTED_LOCALES, localeDescriptor } from '@/i18n';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  // Выбор запоминается тем же ключом, что и в основном интерфейсе: язык,
  // выбранный на входе, должен остаться после него.
  const changeLocale = (locale: string): void => {
    localStorage.setItem('gsm.locale', locale);
    void i18n.changeLanguage(locale);
  };

  const onFinish = async (values: LoginForm): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      // Офис не выбирается на форме входа: пользователь попадает
      // в свой офис по умолчанию, а переключается уже внутри системы.
      await login(values.email, values.password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gsm-login">
      <div className="gsm-login-card">
        <div className="gsm-login-visual">
          <LoginPhotoCarousel />

          <div className="gsm-login-visual-top">
            <div className="gsm-login-wordmark">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2c.9 0 1.5 1.1 1.5 2.6v3.2l7.5 4.3v2l-7.5-2.2v4l2.6 1.9v1.6L12 18.6l-4.1.8v-1.6l2.6-1.9v-4L3 14.1v-2l7.5-4.3V4.6C10.5 3.1 11.1 2 12 2z"
                  fill="currentColor"
                />
              </svg>
              TMS
            </div>

            {/*
              Язык выбирается до входа намеренно: сотрудник, которому русский
              интерфейс незнаком, иначе не понял бы даже подписи полей формы.
            */}
            <Select
              className="gsm-login-locale"
              classNames={{ popup: { root: 'gsm-login-locale-dropdown' } }}
              value={localeDescriptor(i18n.language).code}
              popupMatchSelectWidth={false}
              optionLabelProp="label"
              onChange={changeLocale}
              options={SUPPORTED_LOCALES.map((locale) => ({
                value: locale.code,
                label: (
                  <Space size={8}>
                    <LocaleFlag code={locale.flag} />
                    {locale.label}
                  </Space>
                ),
              }))}
            />
          </div>
        </div>

        <div className="gsm-login-form">
          <div className="gsm-login-form-head">
            <Typography.Title level={3}>{t('Вход в систему')}</Typography.Title>
            <Typography.Text type="secondary">
              {t('Учёт и контроль спецтранспорта аэропортов')}
            </Typography.Text>
          </div>

          {error && <Alert type="error" message={error} showIcon style={{ margin: '16px 0' }} />}

          <Form<LoginForm> layout="vertical" onFinish={onFinish} style={{ marginTop: 24 }}>
            <Form.Item
              name="email"
              label={t('Электронная почта')}
              rules={[{ required: true, type: 'email' }]}
            >
              <Input
                size="large"
                autoComplete="username"
                autoFocus
                placeholder={t('например, chief.tas@gsm.local')}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={t('Пароль')}
              rules={[{ required: true, min: 8 }]}
            >
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>

            <Button
              className="gsm-login-submit"
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
            >
              {t('Войти')}
            </Button>
          </Form>

          <div className="gsm-login-note">
            {t('Нет доступа?')}{' '}
            <b>{t('Обратитесь к администратору вашего офиса')}</b>
            {' — '}
            {t('учётные записи заводятся вручную, самостоятельной регистрации в системе нет.')}
          </div>
        </div>
      </div>
    </div>
  );
}
