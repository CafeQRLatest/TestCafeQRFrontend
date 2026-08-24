import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capawesome/capacitor-app-review';

export default function InAppReviewBridge() {
  useEffect(() => {
    // Only execute on native mobile devices (Android / iOS)
    if (!Capacitor.isNativePlatform()) return;

    const trackActiveDaysAndPromptReview = async () => {
      try {
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

        // 3. Check if already prompted for the 5th-day review
        const alreadyPrompted = localStorage.getItem('cafeqr_review_prompted_5th_day');
        if (alreadyPrompted) return;

        // 4. Milestone Check: User has reached at least 5 active days (1 full business week)
        if (activeDays.length >= 5) {
          const currentHour = new Date().getHours();
          
          // Daytime check: between 9:00 AM (9) and 9:00 PM (21)
          const isDaytime = currentHour >= 9 && currentHour < 21;

          if (isDaytime) {
            console.log('[InAppReviewBridge] 5th Active Day Daytime milestone reached. Requesting Google Play In-App Review...');
            
            // Trigger native Google Play In-App Review bottom sheet
            await InAppReview.requestReview();
            
            // Mark as prompted so we don't repeat
            localStorage.setItem('cafeqr_review_prompted_5th_day', 'true');
          } else {
            console.log(`[InAppReviewBridge] 5th Active Day reached, but current hour (${currentHour}) is outside daytime hours (9 AM - 9 PM). Postponing prompt.`);
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
