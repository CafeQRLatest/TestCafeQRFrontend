import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { useNotification } from '../context/NotificationContext';

/**
 * useBackup — Custom hook for the Backup & Restore feature.
 *
 * Manages settings, backup list, manual creation, download,
 * restore upload / preview / confirm.
 */
export function useBackup() {
  const { notify } = useNotification();

  /* ── settings ── */
  const [settings, setSettings] = useState({
    scheduleEnabled: false,
    scheduleFrequency: 'MANUAL',
    retentionCount: 10,
    updatedAt: null,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  /* ── backup list ── */
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(true);

  /* ── create backup ── */
  const [creating, setCreating] = useState(false);

  /* ── restore flow ── */
  const [restoreFile, setRestoreFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // BackupPreviewResponse
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  /* ── OTP flow ── */
  const [otpSending, setOtpSending] = useState(false);

  /* ── download progress ── */
  const [downloadingId, setDownloadingId] = useState(null);

  /* ── mount guard ── */
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  /* ──────────────────────────── FETCHERS ──────────────────────────── */

  const fetchSettings = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const resp = await api.get('/api/v1/backup-settings');
      if (resp.data?.success && mounted.current) {
        const d = resp.data.data;
        setSettings({
          scheduleEnabled: d.scheduleEnabled ?? false,
          scheduleFrequency: d.scheduleFrequency ?? 'MANUAL',
          retentionCount: d.retentionCount ?? 10,
          updatedAt: d.updatedAt,
        });
      }
    } catch (err) {
      if (mounted.current) notify('error', 'Failed to load backup settings.');
    } finally {
      if (mounted.current) setSettingsLoading(false);
    }
  }, [notify]);

  const fetchBackups = useCallback(async () => {
    try {
      setBackupsLoading(true);
      const resp = await api.get('/api/v1/backups');
      if (resp.data?.success && mounted.current) {
        setBackups(resp.data.data || []);
      }
    } catch (err) {
      if (mounted.current) notify('error', 'Failed to load backups.');
    } finally {
      if (mounted.current) setBackupsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchSettings();
    fetchBackups();
  }, [fetchSettings, fetchBackups]);

  /* ──────────────────────────── SETTINGS ──────────────────────────── */

  const updateSettings = useCallback(async (patch) => {
    const merged = { ...settings, ...patch };
    try {
      setSettingsSaving(true);
      const resp = await api.put('/api/v1/backup-settings', {
        scheduleEnabled: merged.scheduleEnabled,
        scheduleFrequency: merged.scheduleFrequency,
        retentionCount: merged.retentionCount,
      });
      if (resp.data?.success && mounted.current) {
        const d = resp.data.data;
        setSettings({
          scheduleEnabled: d.scheduleEnabled,
          scheduleFrequency: d.scheduleFrequency,
          retentionCount: d.retentionCount,
          updatedAt: d.updatedAt,
        });
        notify('success', resp.data.message || 'Backup settings saved.');
      }
    } catch (err) {
      if (mounted.current) notify('error', err.response?.data?.message || 'Failed to save settings.');
    } finally {
      if (mounted.current) setSettingsSaving(false);
    }
  }, [settings, notify]);

  /* ──────────────────────────── CREATE BACKUP ──────────────────────────── */

  const createBackup = useCallback(async () => {
    try {
      setCreating(true);
      const resp = await api.post('/api/v1/backups');
      if (resp.data?.success && mounted.current) {
        notify('success', resp.data.message || 'Backup created successfully.');
        fetchBackups();
      }
    } catch (err) {
      if (mounted.current) notify('error', err.response?.data?.message || 'Backup failed.');
    } finally {
      if (mounted.current) setCreating(false);
    }
  }, [notify, fetchBackups]);

  /* ──────────────────────────── DOWNLOAD ──────────────────────────── */

  const downloadBackup = useCallback(async (backupId, fileName) => {
    try {
      setDownloadingId(backupId);
      const resp = await api.get(`/api/v1/backups/${backupId}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([resp.data], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || `cafeqr-backup-${backupId}.cqrbak`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      if (mounted.current) notify('success', 'Backup downloaded.');
    } catch (err) {
      if (mounted.current) notify('error', err.response?.data?.message || 'Download failed.');
    } finally {
      if (mounted.current) setDownloadingId(null);
    }
  }, [notify]);

  /* ──────────────────────────── RESTORE — UPLOAD & PREVIEW ──────────────────────────── */

  const uploadAndPreview = useCallback(async (file) => {
    if (!file) return;
    setRestoreFile(file);
    setPreview(null);
    setRestoreResult(null);
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const resp = await api.post('/api/v1/backups/restore/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (resp.data?.success && mounted.current) {
        setPreview(resp.data.data);
        notify('success', resp.data.message || 'Restore preview ready.');
      }
    } catch (err) {
      if (mounted.current) {
        notify('error', err.response?.data?.message || 'Failed to read backup file.');
        setRestoreFile(null);
      }
    } finally {
      if (mounted.current) setUploading(false);
    }
  }, [notify]);

  /* ──────────────────────────── SEND OTP ──────────────────────────── */

  const sendOtp = useCallback(async () => {
    try {
      setOtpSending(true);
      await api.post('/api/v1/auth/otp/send');
      if (mounted.current) notify('success', 'OTP sent to your registered email.');
    } catch (err) {
      if (mounted.current) notify('error', err.response?.data?.message || 'Failed to send OTP.');
    } finally {
      if (mounted.current) setOtpSending(false);
    }
  }, [notify]);

  /* ──────────────────────────── RESTORE — CONFIRM ──────────────────────────── */

  const confirmRestore = useCallback(async ({ currentPassword, otp, confirmationText }) => {
    if (!preview?.restoreToken) {
      notify('error', 'Preview the backup file first.');
      return false;
    }
    try {
      setRestoring(true);
      const resp = await api.post('/api/v1/backups/restore/confirm', {
        restoreToken: preview.restoreToken,
        currentPassword,
        otp,
        confirmationText,
      });
      if (resp.data?.success && mounted.current) {
        setRestoreResult(resp.data.data);
        notify('success', resp.data.message || 'Data restored successfully!');
        fetchBackups();
        return true;
      }
      return false;
    } catch (err) {
      if (mounted.current) notify('error', err.response?.data?.message || 'Restore failed.');
      return false;
    } finally {
      if (mounted.current) setRestoring(false);
    }
  }, [preview, notify, fetchBackups]);

  /* ──────────────────────────── RESET RESTORE STATE ──────────────────────────── */

  const resetRestore = useCallback(() => {
    setRestoreFile(null);
    setPreview(null);
    setRestoreResult(null);
  }, []);

  return {
    // Settings
    settings, settingsLoading, settingsSaving, updateSettings, fetchSettings,
    // Backups
    backups, backupsLoading, fetchBackups,
    // Create
    creating, createBackup,
    // Download
    downloadingId, downloadBackup,
    // Restore
    restoreFile, uploading, preview, restoring, restoreResult,
    uploadAndPreview, confirmRestore, resetRestore,
    // OTP
    otpSending, sendOtp,
  };
}
