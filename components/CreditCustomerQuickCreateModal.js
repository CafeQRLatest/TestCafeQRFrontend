import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import api from '../utils/api';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1800;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Card = styled.div`
  width: min(440px, 100%);
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.28);
  overflow: hidden;
`;

const Header = styled.div`
  padding: 22px 24px 10px;

  h3 {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
    font-weight: 900;
  }

  p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.5;
  }
`;

const Body = styled.div`
  padding: 14px 24px 24px;
  display: grid;
  gap: 16px;
`;

const Field = styled.label`
  display: grid;
  gap: 7px;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;

  input {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    background: #f8fafc;
    color: #0f172a;
    outline: none;
    padding: 12px 14px;
    font-size: 15px;
    font-weight: 800;

    &:focus {
      border-color: ${props => props.$themeColor || '#14b8a6'};
      background: white;
      box-shadow: 0 0 0 3px ${props => props.$themeColor || '#14b8a6'}22;
    }
  }
`;

const Hint = styled.div`
  color: #dc2626;
  font-size: 11px;
  font-weight: 800;
`;

const ErrorBox = styled.div`
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fef2f2;
  color: #dc2626;
  padding: 11px 12px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
`;

const Footer = styled.div`
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
  padding: 18px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;

  @media (max-width: 420px) {
    flex-direction: column-reverse;
  }
`;

const ActionButton = styled.button`
  min-height: 42px;
  border: 1px solid ${props => props.$primary ? 'transparent' : '#cbd5e1'};
  border-radius: 99px;
  background: ${props => props.$primary ? props.$themeColor || '#14b8a6' : 'white'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  padding: 0 20px;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

export default function CreditCustomerQuickCreateModal({
  open,
  initialName = '',
  initialPhone = '',
  themeColor = '#14b8a6',
  onClose,
  onCreated,
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialName || '');
    setPhone(String(initialPhone || '').replace(/\D/g, '').slice(0, 10));
    setSaving(false);
    setError('');
  }, [initialName, initialPhone, open]);

  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const validPhone = /^\d{10}$/.test(trimmedPhone);
  const canSave = trimmedName.length >= 2 && validPhone && !saving;

  if (!open) return null;

  const handleSave = async () => {
    if (!canSave) {
      setError('Enter a customer name and a valid 10-digit phone number.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await api.post('/api/v1/credit/customers', {
        name: trimmedName,
        phone: trimmedPhone,
        creditLimit: 0,
        openingBalance: 0,
      });
      const created = response.data?.data;
      if (!created?.id) {
        throw new Error('Credit customer was created but the response was incomplete.');
      }
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create credit customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Backdrop
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !saving) {
          onClose?.();
        }
      }}
    >
      <Card onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <h3>New Credit Customer</h3>
          <p>Enter customer details to establish a credit account.</p>
        </Header>
        <Body>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Field $themeColor={themeColor}>
            Full Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field $themeColor={themeColor}>
            Phone Number
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
            />
            {trimmedPhone.length > 0 && !validPhone && <Hint>Please enter a 10-digit phone number</Hint>}
          </Field>
        </Body>
        <Footer>
          <ActionButton type="button" disabled={saving} onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton type="button" $primary $themeColor={themeColor} disabled={!canSave} onClick={handleSave}>
            {saving ? 'Saving...' : 'Create Account'}
          </ActionButton>
        </Footer>
      </Card>
    </Backdrop>
  );
}
