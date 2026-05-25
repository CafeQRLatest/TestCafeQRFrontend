import React from 'react';
import CafeQRPopup from '../CafeQRPopup';
import { FaCog, FaPlus, FaUndo } from 'react-icons/fa';
import styles from './Expenses.module.css';

export default function CategoryManager({
  categories,
  catName, setCatName,
  catSaving,
  catActiveFilter, setCatActiveFilter,
  addCategory,
  toggleCatActive,
  currentScope,   // branchId or 'GLOBAL' — passed from the expense form or page
  onClose
}) {
  const visible = categories.filter(c =>
    catActiveFilter ? c.active !== false : c.active === false
  );

  return (
    <CafeQRPopup
      title="Expense Categories"
      icon={FaCog}
      onClose={onClose}
      onCancel={onClose}
      cancelLabel="Close"
      maxWidth="500px"
    >
      {/* New category input row */}
      <div className={styles['cat-add-box']}>
        <input
          id="cat-name-input"
          className={styles['cat-add-in']}
          value={catName}
          onChange={e => setCatName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory(currentScope)}
          placeholder="New category name…"
          autoFocus
        />
        <button
          id="cat-add-btn"
          className={styles['cat-add-btn']}
          onClick={() => addCategory(currentScope)}
          disabled={catSaving || !catName.trim()}
          aria-label="Add category"
        >
          {catSaving ? '…' : <FaPlus />}
        </button>
      </div>

      {/* Active / Inactive tabs */}
      <div className={styles['cat-filter-tabs']}>
        <button
          type="button"
          id="cat-tab-active"
          className={`${styles['cat-tab']} ${catActiveFilter ? styles.on : ''}`}
          onClick={() => setCatActiveFilter(true)}
        >
          Active
        </button>
        <button
          type="button"
          id="cat-tab-inactive"
          className={`${styles['cat-tab']} ${!catActiveFilter ? styles.on : ''}`}
          onClick={() => setCatActiveFilter(false)}
        >
          Inactive
        </button>
      </div>

      {/* Category list */}
      <div className={styles['cat-list']}>
        {visible.map(c => (
          <div
            key={c.id}
            className={`${styles['cat-item']} ${c.active === false ? styles.inactive : ''}`}
          >
            <div className={styles['cat-item-left']}>
              <div className={styles['cat-dot']} />
              <span className={styles['cat-n']}>{c.name}</span>
            </div>
            <button
              className={`${styles['cat-tog']} ${c.active === false ? styles.restore : styles.deactivate}`}
              onClick={() => toggleCatActive(c)}
            >
              {c.active === false ? <><FaUndo /> Restore</> : 'Deactivate'}
            </button>
          </div>
        ))}
        {visible.length === 0 && (
          <div className={styles['cat-empty']}>
            No {catActiveFilter ? 'active' : 'inactive'} categories found
          </div>
        )}
      </div>
    </CafeQRPopup>
  );
}
