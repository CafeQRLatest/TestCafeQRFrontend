import React, { useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import CafeQRPopup from '../../components/CafeQRPopup';
import { useBackup } from '../../hooks/useBackup';
import {
  FaDatabase, FaDownload, FaCloudUploadAlt, FaCog, FaPlus,
  FaShieldAlt, FaCheckCircle, FaExclamationTriangle, FaFileArchive,
  FaSyncAlt, FaTrashAlt, FaInfoCircle, FaClock, FaKey, FaLock,
} from 'react-icons/fa';
import styles from '../../components/backup/DataBackup.module.css';

export default function DataBackupPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'STAFF']} requiredMenu="Data Backup">
      <DataBackupContent />
    </RoleGate>
  );
}

function DataBackupContent() {
  const {
    settings, settingsLoading, settingsSaving, updateSettings,
    backups, backupsLoading, fetchBackups,
    creating, createBackup,
    downloadingId, downloadBackup,
    restoreFile, uploading, preview, restoring, restoreResult,
    uploadAndPreview, confirmRestore, resetRestore,
    otpSending, sendOtp,
  } = useBackup();

  const [showRestoreModal, setShowRestoreModal] = useState(false);

  return (
    <>
      <Head>
        <title>Data Backup — Cafe QR</title>
        <meta name="description" content="Backup and restore your restaurant data. Create manual backups, schedule automatic backups, and restore from backup files." />
      </Head>

      <DashboardLayout title="Data Backup">
        <div className={styles['bk-page']}>

          {/* ═══ HERO BANNER ═══ */}
          <HeroBanner
            creating={creating}
            onCreateBackup={createBackup}
            onOpenRestore={() => { resetRestore(); setShowRestoreModal(true); }}
          />

          {/* ═══ SETTINGS + RESTORE SIDE-BY-SIDE ═══ */}
          <div className={styles['bk-two-col']}>
            <SettingsCard
              settings={settings}
              loading={settingsLoading}
              saving={settingsSaving}
              onUpdate={updateSettings}
            />
            <QuickRestoreCard
              onOpenRestore={() => { resetRestore(); setShowRestoreModal(true); }}
            />
          </div>

          {/* ═══ BACKUP HISTORY ═══ */}
          <BackupHistoryCard
            backups={backups}
            loading={backupsLoading}
            downloadingId={downloadingId}
            onDownload={downloadBackup}
            onRefresh={fetchBackups}
          />

        </div>
      </DashboardLayout>

      {/* ═══ RESTORE MODAL ═══ */}
      {showRestoreModal && (
        <RestoreModal
          restoreFile={restoreFile}
          uploading={uploading}
          preview={preview}
          restoring={restoring}
          restoreResult={restoreResult}
          otpSending={otpSending}
          onUpload={uploadAndPreview}
          onConfirm={confirmRestore}
          onSendOtp={sendOtp}
          onReset={resetRestore}
          onClose={() => setShowRestoreModal(false)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function HeroBanner({ creating, onCreateBackup, onOpenRestore }) {
  return (
    <div className={styles['bk-hero']}>
      <div className={styles['bk-hero-inner']}>
        <div className={styles['bk-hero-text']}>
          <h2>Backup & Restore</h2>
          <p>
            Protect your restaurant data. Create backups on demand or schedule them automatically.
            Restore anytime from a downloaded backup file.
          </p>
        </div>
        <div className={styles['bk-hero-actions']}>
          <button
            id="btn-create-backup"
            className={`${styles['bk-btn']} ${styles.primary}`}
            onClick={onCreateBackup}
            disabled={creating}
          >
            {creating
              ? <><span className={styles['bk-spinner']} /> Creating...</>
              : <><FaPlus /> Create Backup Now</>
            }
          </button>
          <button
            id="btn-open-restore"
            className={`${styles['bk-btn']} ${styles.secondary}`}
            onClick={onOpenRestore}
          >
            <FaCloudUploadAlt /> Restore from File
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsCard({ settings, loading, saving, onUpdate }) {
  if (loading) {
    return (
      <div className={styles['bk-card']}>
        <div className={styles['bk-card-head']}>
          <div className={styles['bk-card-title']}>
            <div className={`${styles.ic} ${styles.orange}`}><FaCog /></div>
            Backup Settings
          </div>
        </div>
        <div className={styles['bk-card-body']}>
          <div className={styles['bk-skeleton']}>
            <div className={styles['bk-skeleton-row']} />
            <div className={styles['bk-skeleton-row']} />
            <div className={styles['bk-skeleton-row']} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['bk-card']}>
      <div className={styles['bk-card-head']}>
        <div className={styles['bk-card-title']}>
          <div className={`${styles.ic} ${styles.orange}`}><FaCog /></div>
          Backup Settings
        </div>
        {saving && <span className={styles['bk-spinner']} style={{ color: '#f97316' }} />}
      </div>
      <div className={styles['bk-card-body']}>
        <div className={styles['bk-settings-grid']}>

          {/* Schedule toggle */}
          <div className={styles['bk-setting']}>
            <span className={styles['bk-setting-label']}>Automatic Backup</span>
            <div className={styles['bk-toggle-row']}>
              <label className={styles['bk-toggle']}>
                <input
                  id="toggle-schedule"
                  type="checkbox"
                  checked={settings.scheduleEnabled}
                  onChange={(e) => onUpdate({ scheduleEnabled: e.target.checked })}
                  disabled={saving}
                />
                <span className={styles['bk-toggle-track']} />
              </label>
              <span className={styles['bk-toggle-label']}>
                {settings.scheduleEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <span className={styles['bk-setting-desc']}>
              When enabled, backups are created automatically per your schedule.
            </span>
          </div>

          {/* Frequency */}
          <div className={styles['bk-setting']}>
            <span className={styles['bk-setting-label']}>Schedule Frequency</span>
            <select
              id="select-frequency"
              className={styles['bk-select']}
              value={settings.scheduleFrequency}
              onChange={(e) => onUpdate({ scheduleFrequency: e.target.value })}
              disabled={saving}
            >
              <option value="MANUAL">Manual Only</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
            <span className={styles['bk-setting-desc']}>
              How often automatic backups are created.
            </span>
          </div>

          {/* Retention */}
          <div className={styles['bk-setting']}>
            <span className={styles['bk-setting-label']}>Retention Count</span>
            <input
              id="input-retention"
              type="number"
              className={styles['bk-input']}
              value={settings.retentionCount}
              min={1}
              max={50}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 50) onUpdate({ retentionCount: v });
              }}
              disabled={saving}
            />
            <span className={styles['bk-setting-desc']}>
              Keep the last N backups (older ones auto-deleted). Range: 1–50.
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}

function QuickRestoreCard({ onOpenRestore }) {
  return (
    <div className={styles['bk-card']}>
      <div className={styles['bk-card-head']}>
        <div className={styles['bk-card-title']}>
          <div className={`${styles.ic} ${styles.purple}`}><FaSyncAlt /></div>
          Restore Data
        </div>
      </div>
      <div className={styles['bk-card-body']}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
            Upload a previously downloaded <strong>.cqrbak</strong> backup file to restore your restaurant data.
            A safety backup is automatically created before any restore.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <InfoChip icon={<FaShieldAlt />} text="Pre-restore safety backup" />
            <InfoChip icon={<FaLock />} text="Password + OTP required" />
            <InfoChip icon={<FaCheckCircle />} text="Checksum verified" />
          </div>
          <button
            id="btn-restore-card"
            className={`${styles['bk-btn']} ${styles.outline}`}
            onClick={onOpenRestore}
          >
            <FaCloudUploadAlt /> Upload Backup File
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoChip({ icon, text }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '5px 10px', borderRadius: '8px',
      background: '#f0fdf4', color: '#16a34a',
      fontSize: '11px', fontWeight: 700,
    }}>
      {icon} {text}
    </span>
  );
}

function BackupHistoryCard({ backups, loading, downloadingId, onDownload, onRefresh }) {
  return (
    <div className={styles['bk-card']}>
      <div className={styles['bk-card-head']}>
        <div className={styles['bk-card-title']}>
          <div className={`${styles.ic} ${styles.blue}`}><FaDatabase /></div>
          Backup History
        </div>
        <button
          id="btn-refresh-backups"
          className={`${styles['bk-btn']} ${styles.ghost} ${styles.sm}`}
          onClick={onRefresh}
        >
          <FaSyncAlt /> Refresh
        </button>
      </div>
      <div className={styles['bk-card-body']} style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '22px' }}>
            <div className={styles['bk-skeleton']}>
              {[1, 2, 3].map(i => <div key={i} className={styles['bk-skeleton-row']} />)}
            </div>
          </div>
        ) : backups.length === 0 ? (
          <div className={styles['bk-empty']}>
            <div className={styles['bk-empty-icon']}><FaDatabase /></div>
            <div className={styles['bk-empty-title']}>No Backups Yet</div>
            <div className={styles['bk-empty-sub']}>
              Create your first backup to protect your restaurant data.
            </div>
          </div>
        ) : (
          <div className={styles['bk-table-wrap']}>
            <table className={styles['bk-table']}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Rows</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.id}>
                    <td>
                      <span className={styles['bk-file-name']} title={b.fileName}>
                        {b.fileName || '—'}
                      </span>
                    </td>
                    <td>
                      <TypeBadge type={b.type} />
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>{formatBytes(b.sizeBytes)}</td>
                    <td>{(b.rowCount || 0).toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(b.createdAt)}</td>
                    <td>
                      {b.status === 'COMPLETED' && (
                        <button
                          id={`btn-download-${b.id}`}
                          className={`${styles['bk-btn']} ${styles.outline} ${styles.sm}`}
                          onClick={() => onDownload(b.id, b.fileName)}
                          disabled={downloadingId === b.id}
                        >
                          {downloadingId === b.id
                            ? <span className={styles['bk-spinner']} />
                            : <FaDownload />
                          }
                          Download
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ type }) {
  const map = {
    MANUAL: { label: 'Manual', cls: 'completed' },
    SCHEDULED: { label: 'Scheduled', cls: 'previewed' },
    PRE_RESTORE: { label: 'Pre-Restore', cls: 'running' },
  };
  const cfg = map[type] || { label: type, cls: 'expired' };
  return <span className={`${styles['bk-badge']} ${styles[cfg.cls]}`}>{cfg.label}</span>;
}

function StatusBadge({ status }) {
  const map = {
    COMPLETED: 'completed',
    RUNNING: 'running',
    FAILED: 'failed',
    PREVIEWED: 'previewed',
    RESTORED: 'restored',
    EXPIRED: 'expired',
  };
  return (
    <span className={`${styles['bk-badge']} ${styles[map[status] || 'expired']}`}>
      {status}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESTORE MODAL — Full multi-step flow
   Step 1: Upload .cqrbak file
   Step 2: Preview manifest + warnings
   Step 3: Confirm (password + OTP + type RESTORE)
   Step 4: Result
   ═══════════════════════════════════════════════════════════════════════════ */

function RestoreModal({
  restoreFile, uploading, preview, restoring, restoreResult,
  otpSending, onUpload, onConfirm, onSendOtp, onReset, onClose,
}) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Confirm form state
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showConfirmStep, setShowConfirmStep] = useState(false);

  const handleFile = useCallback((file) => {
    if (file) onUpload(file);
  }, [onUpload]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirmSubmit = useCallback(async () => {
    const success = await onConfirm({ currentPassword: password, otp, confirmationText: confirmText });
    if (success) {
      setPassword('');
      setOtp('');
      setConfirmText('');
      setShowConfirmStep(false);
    }
  }, [onConfirm, password, otp, confirmText]);

  // Determine which step to show
  const isResult = !!restoreResult;
  const isPreview = !!preview && !isResult;
  const isUploadStep = !preview && !isResult;

  const getTitle = () => {
    if (isResult) return 'Restore Complete';
    if (showConfirmStep) return 'Confirm Restore';
    if (isPreview) return 'Restore Preview';
    return 'Restore from Backup';
  };

  return (
    <CafeQRPopup
      title={getTitle()}
      icon={isResult ? FaCheckCircle : FaCloudUploadAlt}
      maxWidth="720px"
      onClose={onClose}
      hideFooter
    >
      {/* ── STEP 1: Upload ── */}
      {isUploadStep && (
        <>
          <div
            className={`${styles['bk-dropzone']} ${dragOver ? styles['drag-over'] : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <>
                <span className={styles['bk-spinner']} style={{ width: 28, height: 28, borderWidth: 3, color: '#f97316' }} />
                <div className={styles['bk-drop-title']}>Reading backup file...</div>
                <div className={styles['bk-drop-sub']}>Verifying checksums and manifest</div>
              </>
            ) : (
              <>
                <div className={styles['bk-drop-icon']}><FaCloudUploadAlt /></div>
                <div className={styles['bk-drop-title']}>
                  {restoreFile ? restoreFile.name : 'Drop your .cqrbak file here'}
                </div>
                <div className={styles['bk-drop-sub']}>
                  or click to browse · CafeQR backup files only
                </div>
                {restoreFile && (
                  <div className={styles['bk-drop-file']}>
                    <FaFileArchive /> {restoreFile.name} ({formatBytes(restoreFile.size)})
                  </div>
                )}
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".cqrbak"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}

      {/* ── STEP 2: Preview ── */}
      {isPreview && !showConfirmStep && (
        <div className={styles['bk-preview']}>
          <div className={styles['bk-preview-header']}>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Review the backup details below before restoring.
            </div>
          </div>

          <div className={styles['bk-preview-meta']}>
            <MetaItem label="Restaurant" value={preview.manifest?.clientName || '—'} />
            <MetaItem label="Created" value={formatDate(preview.manifest?.createdAt)} />
            <MetaItem label="Created By" value={preview.manifest?.createdByEmail || '—'} />
            <MetaItem label="Total Rows" value={(preview.manifest?.totalRows || 0).toLocaleString()} />
            <MetaItem label="Tables" value={preview.manifest?.tables?.length || 0} />
            <MetaItem label="Schema" value={preview.manifest?.schemaVersion || '—'} />
          </div>

          {/* Warnings */}
          {preview.warnings?.length > 0 && (
            <>
              <div className={styles['bk-divider']} />
              <ul className={styles['bk-warning-list']}>
                {preview.warnings.map((w, i) => (
                  <li key={i}>
                    <FaExclamationTriangle className={styles.wi} />
                    {w}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Table breakdown */}
          {preview.manifest?.tables?.length > 0 && (
            <>
              <div className={styles['bk-divider']} />
              <div className={styles['bk-table-summary']}>
                <table>
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.manifest.tables.map((t, i) => (
                      <tr key={i}>
                        <td>{t.table}</td>
                        <td>{(t.rows || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Token expiry */}
          {preview.expiresAt && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', color: '#94a3b8', marginTop: '4px',
            }}>
              <FaClock />
              Restore token expires: {formatDate(preview.expiresAt)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', justifyContent: 'flex-end' }}>
            <button
              className={`${styles['bk-btn']} ${styles.ghost}`}
              onClick={() => { onReset(); }}
            >
              Upload Different File
            </button>
            <button
              id="btn-proceed-restore"
              className={`${styles['bk-btn']} ${styles.danger}`}
              onClick={() => setShowConfirmStep(true)}
            >
              <FaShieldAlt /> Proceed to Restore
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Confirm ── */}
      {isPreview && showConfirmStep && !isResult && (
        <div className={styles['bk-confirm-form']}>
          <div style={{
            padding: '12px 16px', background: '#fef2f2', borderRadius: '10px',
            border: '1px solid #fecaca', fontSize: '12px', color: '#991b1b',
            lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '8px',
          }}>
            <FaExclamationTriangle style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>This will replace ALL current data</strong> for your restaurant.
              A safety backup will be created automatically before the restore begins.
            </div>
          </div>

          <div className={styles['bk-field']}>
            <label htmlFor="restore-password"><FaKey style={{ marginRight: 4 }} /> Current Password</label>
            <input
              id="restore-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your account password"
              autoComplete="current-password"
            />
          </div>

          <div className={styles['bk-otp-row']}>
            <div className={styles['bk-field']}>
              <label htmlFor="restore-otp"><FaLock style={{ marginRight: 4 }} /> OTP Code</label>
              <input
                id="restore-otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit OTP"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
            <button
              id="btn-send-otp"
              className={`${styles['bk-btn']} ${styles.outline} ${styles.sm}`}
              onClick={onSendOtp}
              disabled={otpSending}
              style={{ marginBottom: '5px' }}
            >
              {otpSending ? <span className={styles['bk-spinner']} /> : 'Send OTP'}
            </button>
          </div>
          <span className={styles['bk-field-hint']}>
            An OTP will be sent to your registered email address.
          </span>

          <div className={styles['bk-field']}>
            <label htmlFor="restore-confirm-text">Type <strong>RESTORE</strong> to confirm</label>
            <input
              id="restore-confirm-text"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTORE"
              autoComplete="off"
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', justifyContent: 'flex-end' }}>
            <button
              className={`${styles['bk-btn']} ${styles.ghost}`}
              onClick={() => setShowConfirmStep(false)}
            >
              Back
            </button>
            <button
              id="btn-confirm-restore"
              className={`${styles['bk-btn']} ${styles.danger}`}
              onClick={handleConfirmSubmit}
              disabled={restoring || confirmText !== 'RESTORE' || !password || !otp}
            >
              {restoring
                ? <><span className={styles['bk-spinner']} /> Restoring...</>
                : <><FaShieldAlt /> Confirm Restore</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Result ── */}
      {isResult && (
        <div className={styles['bk-result']}>
          <div className={`${styles['bk-result-icon']} ${styles.success}`}>
            <FaCheckCircle />
          </div>
          <div className={styles['bk-result-title']}>Data Restored Successfully</div>
          <div className={styles['bk-result-sub']}>
            Your restaurant data has been restored from the backup file.
            A safety backup was created before the restore — you can find it in your backup history.
          </div>
          <div className={styles['bk-result-stats']}>
            <div className={styles['bk-stat']}>
              <span className={styles['bk-stat-value']}>{restoreResult.restoredTables || 0}</span>
              <span className={styles['bk-stat-label']}>Tables</span>
            </div>
            <div className={styles['bk-stat']}>
              <span className={styles['bk-stat-value']}>{(restoreResult.restoredRows || 0).toLocaleString()}</span>
              <span className={styles['bk-stat-label']}>Rows</span>
            </div>
          </div>
          <button
            className={`${styles['bk-btn']} ${styles.outline}`}
            onClick={onClose}
            style={{ marginTop: '12px' }}
          >
            Close
          </button>
        </div>
      )}
    </CafeQRPopup>
  );
}

function MetaItem({ label, value }) {
  return (
    <div className={styles['bk-meta-item']}>
      <span className={styles['bk-meta-label']}>{label}</span>
      <span className={styles['bk-meta-value']}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
