import React, { useEffect, useState, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { useRouter } from 'next/router';
import { MdNotificationsActive, MdClose } from 'react-icons/md';

const slideDown = keyframes`
  from { transform: translate(-50%, -100%); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
`;

const slideUp = keyframes`
  from { transform: translate(-50%, 0); opacity: 1; }
  to { transform: translate(-50%, -100%); opacity: 0; }
`;

const BannerContainer = styled.div`
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 16px 20px;
  width: 420px;
  max-width: 90%;
  animation: ${props => props.closing ? slideUp : slideDown} 0.4s forwards cubic-bezier(0.16, 1, 0.3, 1);
  color: white;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: border-color 0.2s;
  
  &:hover {
    border-color: rgba(249, 115, 22, 0.6);
  }
`;

const IconWrapper = styled.div`
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
`;

const Content = styled.div`
  flex-grow: 1;
`;

const Title = styled.h4`
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #f97316;
`;

const Message = styled.p`
  margin: 0;
  font-size: 14px;
  color: #e2e8f0;
  line-height: 1.4;
`;

const ActionButton = styled.button`
  background: #f97316;
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #ea580c;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
`;

export default function PushBanner() {
  const [push, setPush] = useState(null);
  const [closing, setClosing] = useState(false);
  const router = useRouter();
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNewPush = (e) => {
      console.log('[PushBanner] Foreground push event caught:', e.detail);
      
      // Play beep sound if sound enabled
      try {
        if (localStorage.getItem('sound_alert_enabled') !== '0') {
          const audio = new Audio('/beep.mp3');
          audio.play().catch(() => {});
        }
      } catch (err) {
        console.warn('Sound play blocked:', err);
      }

      setClosing(false);
      setPush(e.detail);

      // Auto dismiss after 10s
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        dismiss();
      }, 10000);
    };

    window.addEventListener('new-order-push', handleNewPush);
    return () => {
      window.removeEventListener('new-order-push', handleNewPush);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const dismiss = () => {
    setClosing(true);
    setTimeout(() => {
      setPush(null);
      setClosing(false);
    }, 400);
  };

  const handleAction = (e) => {
    e.stopPropagation();
    if (push?.data?.url) {
      router.push(push.data.url);
    } else {
      router.push('/owner/orders');
    }
    dismiss();
  };

  if (!push) return null;

  const title = push.data?.title || push.notification?.title || 'New Order';
  const body = push.data?.body || push.notification?.body || 'You have a new order.';
  const itemsSummary = push.data?.itemsSummary || '';

  return (
    <BannerContainer closing={closing} onClick={handleAction}>
      <IconWrapper>
        <MdNotificationsActive />
      </IconWrapper>
      <Content>
        <Title>{title}</Title>
        <Message>{itemsSummary ? `${body} - ${itemsSummary}` : body}</Message>
      </Content>
      <ActionButton onClick={handleAction}>View</ActionButton>
      <CloseButton onClick={(e) => { e.stopPropagation(); dismiss(); }}>
        <MdClose size={18} />
      </CloseButton>
    </BannerContainer>
  );
}
