import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

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
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, #0b3d6b 0%, #14507f 100%)',
      }}
    >
      <Card style={{ width: 400 }} styles={{ body: { padding: 32 } }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          {t('auth.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.subtitle')}</Typography.Text>

        {error && (
          <Alert type="error" message={error} showIcon style={{ margin: '16px 0' }} />
        )}

        <Form<LoginForm> layout="vertical" onFinish={onFinish} style={{ marginTop: 24 }}>
          <Form.Item
            name="email"
            label={t('auth.email')}
            rules={[{ required: true, type: 'email' }]}
          >
            <Input size="large" autoComplete="username" autoFocus />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('auth.password')}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
            {t('auth.signIn')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
