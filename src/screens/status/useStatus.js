import { useMemo } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { fromKg, round1 } from '../../shared/stats.js';

// Shared inputs for every status screen.
export function useStatus() {
  const { status, settings, today } = useApp();
  return useMemo(() => {
    const data = status.data || { workouts: [], routine: {}, bodyWeights: [] };
    const unit = settings.unit;
    return {
      loading: status.loading,
      error: status.error,
      ready: Boolean(status.data),
      today,
      workouts: data.workouts,
      routine: data.routine,
      // the active routine counts from the day it was started (null: whole month)
      routineSince: data.routineSince ?? null,
      bodyWeights: data.bodyWeights,
      weeklyGoal: settings.weeklyGoal,
      // Routine is a core feature: adherence follows the active routine whenever one exists.
      useRoutine: Object.keys(data.routine || {}).length > 0,
      extensions: settings.extensions,
      unit,
      fmtW: (kg) => `${round1(fromKg(kg, unit))}${unit}`,
      toUnit: (kg) => round1(fromKg(kg, unit)),
    };
  }, [status, settings, today]);
}
