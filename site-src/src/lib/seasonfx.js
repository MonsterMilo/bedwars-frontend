// Hooks a holiday look fills in so the tracker's click effects take its
// shape (Christmas: snowflakes instead of glass shards).
export const seasonHooks = { burst: null };
const XM_COMBO = ['JOLLY', 'MERRY', 'FESTIVE', 'SNOWED IN', 'FULL BLIZZARD'];
export const comboLabels = labels => (seasonHooks.burst ? XM_COMBO : labels);
