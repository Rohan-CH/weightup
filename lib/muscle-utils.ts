export type MuscleKey =
  | 'chest' | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'traps' | 'lats' | 'upper_back' | 'lower_back'
  | 'biceps' | 'triceps' | 'forearms' | 'abs'
  | 'glutes' | 'quads' | 'hamstrings' | 'calves';

export const MUSCLE_META: Record<MuscleKey, { label: string; color: string; view: 'front' | 'back' | 'both' }> = {
  chest:       { label: 'Chest',        color: '#00f5ff', view: 'front' },
  front_delts: { label: 'Front Delts',  color: '#7c3aed', view: 'front' },
  side_delts:  { label: 'Side Delts',   color: '#a855f7', view: 'front' },
  rear_delts:  { label: 'Rear Delts',   color: '#7c3aed', view: 'back'  },
  traps:       { label: 'Traps',        color: '#00f5ff', view: 'back'  },
  lats:        { label: 'Lats',         color: '#38bdf8', view: 'back'  },
  upper_back:  { label: 'Upper Back',   color: '#0ea5e9', view: 'back'  },
  lower_back:  { label: 'Lower Back',   color: '#f59e0b', view: 'back'  },
  biceps:      { label: 'Biceps',       color: '#10b981', view: 'front' },
  triceps:     { label: 'Triceps',      color: '#f97316', view: 'both'  },
  forearms:    { label: 'Forearms',     color: '#34d399', view: 'both'  },
  abs:         { label: 'Abs',          color: '#ec4899', view: 'front' },
  glutes:      { label: 'Glutes',       color: '#a855f7', view: 'back'  },
  quads:       { label: 'Quads',        color: '#10b981', view: 'front' },
  hamstrings:  { label: 'Hamstrings',   color: '#f59e0b', view: 'back'  },
  calves:      { label: 'Calves',       color: '#ec4899', view: 'both'  },
};

export const HIGHLIGHTER_MAP: Record<MuscleKey, string[]> = {
  chest: ['chest'],
  front_delts: ['front-deltoids'],
  side_delts: ['back-deltoids'],
  rear_delts: ['back-deltoids'],
  traps: ['trapezius'],
  lats: ['upper-back'],
  upper_back: ['upper-back'],
  lower_back: ['lower-back'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  abs: ['abs', 'obliques'],
  glutes: ['gluteal'],
  quads: ['quadriceps', 'adductor'],
  hamstrings: ['hamstring'],
  calves: ['calves', 'left-soleus', 'right-soleus'],
};

export function getMusclesForExercise(name: string, customTargetMuscles?: string[] | null): MuscleKey[] {
  if (customTargetMuscles && customTargetMuscles.length > 0) {
    return customTargetMuscles as MuscleKey[];
  }
  
  const n = name.toLowerCase();
  const m = new Set<MuscleKey>();

  // ── Chest ──
  if (n.includes('bench') || n.includes('chest press')) { m.add('chest'); m.add('triceps'); m.add('front_delts'); }
  if (n.includes('fly') || n.includes('flye') || n.includes('pec deck') || n.includes('cable cross')) m.add('chest');
  if (n.includes('push up') || n.includes('push-up') || n.includes('pushup')) { m.add('chest'); m.add('triceps'); m.add('front_delts'); }
  if (n.includes('dip') && !n.includes('hip')) { m.add('chest'); m.add('triceps'); }
  if (n.includes('incline') && !n.includes('row')) { m.add('chest'); m.add('front_delts'); m.add('triceps'); }
  if (n.includes('decline')) { m.add('chest'); m.add('triceps'); }

  // ── Back ──
  if (n.includes('deadlift')) { m.add('hamstrings'); m.add('glutes'); m.add('lower_back'); m.add('traps'); m.add('lats'); }
  if (n.includes('rdl') || n.includes('romanian') || n.includes('stiff')) { m.add('hamstrings'); m.add('glutes'); m.add('lower_back'); }
  if (n.includes('row') && !n.includes('cable cross')) { m.add('lats'); m.add('upper_back'); m.add('biceps'); m.add('rear_delts'); }
  if (n.includes('pull up') || n.includes('pull-up') || n.includes('pullup') || n.includes('chin up') || n.includes('chin-up')) { m.add('lats'); m.add('biceps'); m.add('upper_back'); }
  if (n.includes('pulldown') || n.includes('pull-down') || n.includes('lat pull')) { m.add('lats'); m.add('biceps'); }
  if (n.includes('shrug')) m.add('traps');
  if (n.includes('face pull')) { m.add('rear_delts'); m.add('traps'); }
  if (n.includes('back extension') || n.includes('hyperextension') || n.includes('good morning')) { m.add('lower_back'); m.add('glutes'); m.add('hamstrings'); }
  if (n.includes('seated cable row') || n.includes('cable row')) { m.add('lats'); m.add('upper_back'); m.add('biceps'); }

  // ── Shoulders ──
  const isShoulderPress = (n.includes('press') && (n.includes('shoulder') || n.includes('overhead') || n.includes('ohp') || n.includes('military') || n.includes('arnold') || n.includes('push press')));
  if (isShoulderPress) { m.add('front_delts'); m.add('side_delts'); m.add('triceps'); }
  if (n.includes('lateral raise') || n.includes('side raise') || n.includes('db lateral') || n.includes('cable lateral')) m.add('side_delts');
  if (n.includes('front raise')) m.add('front_delts');
  if (n.includes('reverse fly') || n.includes('reverse flye') || n.includes('rear delt fly') || n.includes('face pull')) m.add('rear_delts');
  if (n.includes('upright row')) { m.add('side_delts'); m.add('traps'); m.add('biceps'); }

  // ── Biceps ──
  if (n.includes('curl') && !n.includes('leg curl') && !n.includes('hamstring')) { m.add('biceps'); if (n.includes('hammer') || n.includes('reverse')) m.add('forearms'); }
  if (n.includes('bicep') || n.includes('biceps')) m.add('biceps');
  if (n.includes('preacher')) m.add('biceps');

  // ── Triceps ──
  if (n.includes('tricep') || n.includes('triceps') || n.includes('skull') || n.includes('pushdown') || n.includes('kickback') || n.includes('overhead extension') || n.includes('close grip')) m.add('triceps');
  if (n.includes('extension') && (n.includes('tricep') || n.includes('arm') || n.includes('cable'))) m.add('triceps');

  // ── Forearms ──
  if (n.includes('forearm') || n.includes('wrist curl') || n.includes('reverse curl')) m.add('forearms');

  // ── Abs / Core ──
  if (n.includes('crunch') || n.includes('sit up') || n.includes('situp') || n.includes('ab ') || n.includes('abs') || n.includes('core') || n.includes('hollow') || n.includes('l-sit') || n.includes('dragon flag')) m.add('abs');
  if (n.includes('plank')) { m.add('abs'); m.add('lower_back'); }
  if (n.includes('russian twist') || n.includes('woodchop') || n.includes('pallof') || n.includes('cable crunch') || n.includes('hanging leg') || n.includes('leg raise')) m.add('abs');

  // ── Legs ──
  if (n.includes('squat') || n.includes('hack squat') || n.includes('front squat') || n.includes('goblet squat')) { m.add('quads'); m.add('glutes'); m.add('hamstrings'); }
  if (n.includes('leg press')) { m.add('quads'); m.add('glutes'); }
  if (n.includes('lunge') || n.includes('step up') || n.includes('step-up') || n.includes('split squat') || n.includes('bulgarian')) { m.add('quads'); m.add('glutes'); m.add('hamstrings'); }
  if (n.includes('leg extension')) m.add('quads');
  if (n.includes('leg curl') || n.includes('hamstring curl') || n.includes('nordic')) m.add('hamstrings');
  if (n.includes('hip thrust') || n.includes('glute bridge') || n.includes('hip hinge')) { m.add('glutes'); m.add('hamstrings'); }
  if ((n.includes('glute') && !n.includes('bridge')) || n.includes('donkey kick') || n.includes('cable kickback')) m.add('glutes');
  if (n.includes('calf') || n.includes('calves') || n.includes('standing calf') || n.includes('seated calf')) m.add('calves');
  if (n.includes('abductor') || n.includes('adductor')) m.add('quads');

  // Fallback: if "press" with no muscles yet → assume chest press
  if (n.includes('press') && m.size === 0) { m.add('chest'); m.add('triceps'); m.add('front_delts'); }

  return Array.from(m);
}

export function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.length === 3 ? h.charAt(0)+h.charAt(0) : h.substring(0,2), 16);
  const g = parseInt(h.length === 3 ? h.charAt(1)+h.charAt(1) : h.substring(2,4), 16);
  const b = parseInt(h.length === 3 ? h.charAt(2)+h.charAt(2) : h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
