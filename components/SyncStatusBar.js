import React, { useState, useEffect } from 'react';
import { FaSync, FaExclamationTriangle, FaCheckCircle, FaCloudUploadAlt } from 'react-icons/fa';
import { getPendingSyncCount, getConflictEntries, getLastSyncTime } from '../utils/offlineStore';
import { syncQueuedOperations } from '../utils/offlineSync';
import SyncConflictDrawer from './SyncConflictDrawer';

export default function SyncStatusBar({ collapsed }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    // Initial status
    setIsOnline(navigator.onLine);
    
    // Listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Start polling DB for status
    loadStatus();
    const interval = setInterval(loadStatus, 5000); // Check IDB every 5s

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const loadStatus = async () => {
    try {
      const pending = await getPendingSyncCount();
      const conflicts = await getConflictEntries();
      const last = await getLastSyncTime();
      
      setPendingCount(pending);
      setConflictCount(conflicts.length);
      setLastSync(last);
    } catch (err) {
      console.error("Failed to load sync status", err);
    }
  };

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await syncQueuedOperations();
      await loadStatus(); // Refresh counts
    } catch (err) {
      console.error("Manual sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatTimeAgo = (isoString) => {
    if (!isoString) return 'Never';
    const seconds = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return '1+ days ago';
  };

  return (
    <>
      <div className={`mt-auto border-t border-gray-200 bg-gray-50 flex flex-col transition-all duration-300 ${collapsed ? 'p-2' : 'p-4'}`}>
        
        {/* Network Status & Pending/Conflicts */}
        <div className={`flex items-center justify-between mb-2 ${collapsed ? 'flex-col space-y-2' : ''}`}>
          <div className="flex items-center space-x-2" title={isOnline ? "Online" : "Offline"}>
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`}></div>
            {!collapsed && (
              <span className="text-xs font-medium text-gray-600">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
          
          <div className={`flex items-center space-x-2 ${collapsed ? 'flex-col space-y-2 space-x-0' : ''}`}>
            {conflictCount > 0 && (
              <button 
                onClick={() => setShowConflicts(true)}
                title={`${conflictCount} conflicts require review`}
                className="flex items-center justify-center w-6 h-6 rounded bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
              >
                {!collapsed ? (
                  <span className="text-xs font-bold px-1.5 flex items-center">
                    <FaExclamationTriangle className="w-3 h-3 mr-1" />
                    {conflictCount}
                  </span>
                ) : (
                  <FaExclamationTriangle className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            
            {pendingCount > 0 ? (
              <div 
                title={`${pendingCount} operations queued`}
                className="flex items-center justify-center min-w-[24px] h-6 rounded bg-orange-100 text-orange-600 px-1.5"
              >
                {!collapsed ? (
                  <span className="text-xs font-bold flex items-center">
                    <FaCloudUploadAlt className="w-3.5 h-3.5 mr-1" />
                    {pendingCount}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold">{pendingCount}</span>
                )}
              </div>
            ) : (
              <div 
                title="All synced"
                className="flex items-center justify-center w-6 h-6 rounded bg-green-100 text-green-600"
              >
                <FaCheckCircle className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        </div>

        {/* Sync Button */}
        <button
          onClick={handleSyncNow}
          disabled={!isOnline || isSyncing || (pendingCount === 0 && conflictCount === 0)}
          className={`
            flex items-center justify-center rounded-md transition-all
            ${collapsed ? 'p-2' : 'py-2 px-3'}
            ${!isOnline || (pendingCount === 0 && conflictCount === 0)
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
              : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'}
          `}
          title="Sync Now"
        >
          <FaSync className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-orange-500' : ''} ${!collapsed ? 'mr-2' : ''}`} />
          {!collapsed && (
            <span className="text-xs font-semibold whitespace-nowrap">
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </span>
          )}
        </button>

        {/* Last Synced */}
        {!collapsed && (
          <div className="mt-2 text-center">
            <span className="text-[10px] text-gray-400 font-medium">
              Last sync: {formatTimeAgo(lastSync)}
            </span>
          </div>
        )}
      </div>

      <SyncConflictDrawer 
        isOpen={showConflicts} 
        onClose={() => {
          setShowConflicts(false);
          loadStatus();
        }} 
      />
    </>
  );
}
