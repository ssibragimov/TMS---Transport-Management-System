import { Alert, Button, Card, Form, Input, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { LoginBackdrop } from '@/components/LoginBackdrop';
import { LocaleFlag } from '@/components/LocaleFlag';
import { LoginHero } from '@/components/LoginHero';
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
      {/* Перрон на весь экран позади формы: ВПП, огни, самолёт с тягачом. */}
      <LoginBackdrop />
      {/*
        Язык выбирается до входа намеренно: сотрудник, которому русский
        интерфейс незнаком, иначе не понял бы даже подписи полей формы.
      */}
      <div className="gsm-login-lang">
        <Select
          value={localeDescriptor(i18n.language).code}
          style={{ width: 150 }}
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

      <div className="gsm-login-stack">
        <LoginHero />

        <Card className="gsm-login-card" styles={{ body: { padding: 32 } }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          {t('Вход в систему')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('Учёт спецтранспорта и ГСМ')}</Typography.Text>

        {error && (
          <Alert type="error" message={error} showIcon style={{ margin: '16px 0' }} />
        )}

        <Form<LoginForm> layout="vertical" onFinish={onFinish} style={{ marginTop: 24 }}>
          <Form.Item
            name="email"
            label={t('Электронная почта')}
            rules={[{ required: true, type: 'email' }]}
          >
            <Input size="large" autoComplete="username" autoFocus />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('Пароль')}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
            {t('Войти')}
          </Button>
        </Form>
        </Card>
      </div>
    </div>
  );
}
