// ============================================
// Shared Constants
// ============================================

import type { GrowthStage } from './types';

export const GROWTH_STAGES: { value: GrowthStage; label: string }[] = [
  { value: 'seedling', label: 'Seedling' },
  { value: 'vegetative', label: 'Vegetative' },
  { value: 'pre-flower', label: 'Pre-Flower' },
  { value: 'flowering', label: 'Flowering' },
  { value: 'late-flower', label: 'Late Flower' },
  { value: 'harvest-ready', label: 'Harvest Ready' },
  { value: 'drying', label: 'Drying' },
  { value: 'curing', label: 'Curing' },
];

export const COMMON_MEDIA = [
  'Soil', 'Coco Coir', 'Hydroponics (DWC)', 'Hydroponics (RDWC)', 'Perlite',
  'Rockwool', 'Peat Moss', 'Living Soil', 'Promix', 'Aeroponics',
];

export const COMMON_SYMPTOMS = [
  'Yellowing leaves', 'Brown spots', 'Leaf curling', 'Wilting', 'Slow growth',
  'Purple stems', 'Drooping', 'Burnt leaf tips', 'White powder', 'Webbing',
  'Small insects', 'Stunted growth', 'Leaf drop', 'Mold', 'Discoloration',
];

export const QUICK_SYMPTOMS = [
  'Yellowing leaves', 'Brown spots', 'Leaf curling', 'Wilting', 'Burnt tips',
  'White powder', 'Webbing', 'Mold', 'Slow growth',
];
