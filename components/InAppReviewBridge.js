import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export default function InAppReviewBridge() {
  useEffect(() => {
    // Only execute on native mobile devices (Android / iOS)
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

    const trackActiveDaysAndPromptReview = async () => {
      try {
        const pkgName = '@capawesome/capacitor-app-review';
        const mod = await import(/* webpackIgnore: true */ pkgName);
        const InAppReview = mod?.InAppReview;
        if (!InAppReview) return;
        const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        // 1. Retrieve unique active days from localStorage
        let activeDays = [];
        try {
          const stored = localStorage.getItem('cafeqr_active_days');
          activeDays = stored ? JSON.parse(stored) : [];
        } catch (e) {
          activeDays = [];
        }

        // 2. Track today as an active day if not already saved
        if (!activeDays.includes(todayStr)) {
          activeDays.push(todayStr);
          localStorage.setItem('cafeqr_active_days', JSON.stringify(activeDays));
          console.log(`[InAppReviewBridge] Registered active day ${activeDays.length}:`, todayStr);
        }

        // 3. Smart Retry Interval (30 Days)
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const lastPromptTime = localStorage.getItem('cafeqr_play_review_last_prompt_timestamp');
        
        if (lastPromptTime) {
          const timeElapsed = Date.now() - Number(lastPromptTime);
          if (timeElapsed < THIRTY_DAYS_MS) {
            // Less than 30 days since last prompt attempt
            return;
          }
        }

        // 4. Milestone Check: User has reached at least 5 active days (1 full business week)
        if (activeDays.length >= 5) {
          const currentHour = new Date().getHours();
          
          // Daytime check: between 9:00 AM (9) and 9:00 PM (21)
          const isDaytime = currentHour >= 9 && currentHour < 21;

          if (isDaytime) {
            console.log('[InAppReviewBridge] 5th Active Day (or 30-day retry interval) reached. Requesting Google Play In-App Review...');
            
            // Trigger native Google Play In-App Review bottom sheet
            await InAppReview.requestReview();
            
            // Store timestamp of this attempt
            localStorage.setItem('cafeqr_play_review_last_prompt_timestamp', Date.now().toString());
          } else {
            console.log(`[InAppReviewBridge] Milestone reached, but current hour (${currentHour}) is outside daytime hours (9 AM - 9 PM). Postponing prompt.`);
          }
        }
      } catch (error) {
        console.error('[InAppReviewBridge] Error checking review prompt milestone:', error);
      }
    };

    trackActiveDaysAndPromptReview();
  }, []);

  return null; // Invisible lifecycle component
}
