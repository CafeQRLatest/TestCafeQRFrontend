import React, { useState, useEffect } from 'react';
import { FaTimes, FaRedo, FaTrash, FaExclamationCircle } from 'react-icons/fa';
import { getConflictEntries, markOperationPending, discardSyncQueueEntry } from '../utils/offlineStore';
import { syncQueuedOperations } from '../utils/offlineSync';

export default function SyncConflictDrawer({ isOpen, onClose }) {
  const [conflicts, setConflicts] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConflicts();
    }
  }, [isOpen]);

  const loadConflicts = async () => {
    try {
      const entries = await getConflictEntries();
      setConflicts(entries);
    } catch (err) {
      console.error("Failed to load conflicts", err);
    }
  };

  const handleRetry = async (id) => {
    setIsProcessing(true);
    try {
      await markOperationPending(id);
      await syncQueuedOperations();
      await loadConflicts();
    } catch (err) {
      console.error("Failed to retry conflict", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = async (id) => {
    if (!window.confirm("Are you sure you want to discard this operation? This data will be lost.")) return;
    setIsProcessing(true);
    try {
      await discardSyncQueueEntry(id);
      await loadConflicts();
    } catch (err) {
      console.error("Failed to discard conflict", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryAll = async () => {
    setIsProcessing(true);
    try {
      for (const c of conflicts) {
        await markOperationPending(c.id);
      }
      await syncQueuedOperations();
      await loadConflicts();
    } catch (err) {
      console.error("Failed to retry all", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col transform transition-transform duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-red-50">
          <div className="flex items-center text-red-700">
            <FaExclamationCircle className="w-5 h-5 mr-2" />
            <h2 className="text-lg font-bold">Sync Conflicts</h2>
            <span className="ml-3 bg-red-200 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {conflicts.length}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {conflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
              <FaCheckCircle className="w-12 h-12 text-green-300" />
              <p className="text-sm font-medium">All conflicts resolved</p>
            </div>
          ) : (
            <div className="space-y-4">
              {conflicts.map(conflict => (
                <div key={conflict.id} className="bg-white rounded-lg shadow-sm border border-red-100 overflow-hidden">
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase
                          ${conflict.method === 'DELETE' ? 'bg-red-100 text-red-700' : 
                            conflict.method === 'PUT' ? 'bg-blue-100 text-blue-700' : 
                            'bg-green-100 text-green-700'}`}
                        >
                          {conflict.method}
                        </span>
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {conflict.entity || 'Data'}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(conflict.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-sm text-gray-800 font-medium truncate">
                        {conflict.path}
                      </p>
                      <div className="mt-2 bg-red-50 rounded border border-red-100 p-2 text-xs text-red-600 font-medium break-words">
                        {conflict.lastError || 'Server rejected the operation'}
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleRetry(conflict.id)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <FaRedo className="w-3 h-3 mr-1.5" /> Retry
                      </button>
                      <button
                        onClick={() => handleDiscard(conflict.id)}
                        disabled={isProcessing}
                        className="flex items-center justify-center px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Discard changes"
                      >
                        <FaTrash className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {conflicts.length > 0 && (
          <div className="p-4 border-t border-gray-200 bg-white">
            <button
              onClick={handleRetryAll}
              disabled={isProcessing}
              className="w-full flex items-center justify-center py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Retry All Conflicts'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// Needed because I used FaCheckCircle in the empty state
import { FaCheckCircle } from 'react-icons/fa';
