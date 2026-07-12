// Single source of truth for tunable constants (see build spec).

export const INSIGHT_WINDOW_DAYS = 56; // trailing window for all insight views
export const SYMPTOM_LOOKBACK_DAYS = 2; // dinners on the symptom day and the N days before count as "preceding"
export const MIN_SYMPTOM_OCCURRENCES = 4; // below this, show data but suppress ranking

// Category names must match Restock's category strings so imported data maps cleanly.
export const BASKET_HEALTHY_CATEGORIES = ['Vegetables', 'Fruit'];
export const BASKET_WATCH_CATEGORIES = ['Snacks', 'Drinks'];

export const SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'vitals-backup';
export const BACKUP_VERSION = 1;
export const BUNDLE_PREFIX = 'VITL1:';

export const SEED_SYMPTOM_TAGS = [
  'Bloating', 'Headache', 'Fatigue', 'Poor sleep', 'Joint pain',
  'Skin flare-up', 'Stomach upset', 'Congestion', 'Low mood', 'Heartburn',
];

// Suggestions shown when tagging a dish's ingredients (not rows in a table).
export const COMMON_INGREDIENTS = [
  'onion', 'garlic', 'tomato', 'dairy', 'egg', 'wheat/gluten', 'soy', 'rice',
  'chicken', 'fish', 'nuts', 'chili', 'coffee', 'sugar', 'olive oil',
  'spinach', 'broccoli',
];

// Starter dishes so logging works on day one. Seeded at first launch.
export const SEED_DISHES = [
  { name: 'Dal with rice', ingredients: ['lentils', 'onion', 'tomato', 'rice'] },
  { name: 'Tofu stir-fry', ingredients: ['tofu', 'soy', 'broccoli', 'garlic'] },
  { name: 'Omelette', ingredients: ['egg', 'onion'] },
];
