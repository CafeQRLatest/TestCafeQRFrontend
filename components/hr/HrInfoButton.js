import { useState } from 'react';
import { FaInfoCircle } from 'react-icons/fa';
import CafeQRPopup from '../CafeQRPopup';

// Small info button used across HR screens. Opens the standard CafeQR popup with the explanation.
export default function HrInfoButton({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`About ${title}`}
        title={`About ${title}`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, padding: 0, borderRadius: '50%',
          border: '1px solid #fed7aa', background: '#fff7ed', color: '#ea580c',
          fontSize: 14, cursor: 'pointer', flexShrink: 0,
        }}
      >
        <FaInfoCircle />
      </button>

      {open && (
        <CafeQRPopup
          title={title}
          icon={FaInfoCircle}
          onClose={() => setOpen(false)}
          hideFooter
          maxWidth="480px"
        >
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#334155' }}>{children}</div>
        </CafeQRPopup>
      )}
    </>
  );
}
