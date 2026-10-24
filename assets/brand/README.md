# Neocast kit crops (Oct 24 2026)
These are cut from Martin's brand-standard vectors (`../Neocast-Black.svg`, `../Neocast-White.svg`). Nothing is redrawn.

- `neocast-lockup-black.svg` / `neocast-lockup-white.svg`: the whole lockup with the transparent margin trimmed (viewBox 125.17 881.58 1779.75 284.93). Use them when you need the lockup's ink edges to align to a grid.
- `neocast-symbol-crop.svg`: the symbol alone, trimmed to its outline (382.29 × 284.93).
- `neocast-wordmark-black.svg` / `neocast-wordmark-white.svg`: the wordmark alone at full lockup height (1298.52 × 284.93). Only for a future animation where the wordmark slides out from behind the symbol. Never use them to "write" neocast elsewhere.

Lockup ratios measured from the vector:
- symbol width / height: 1.3417
- lockup width / height: 6.24627
- symbol share of the lockup width: 0.2148
- the wordmark starts at 0.27039 of the lockup width and spans 0.72961 of it

The symbol crop is not named `neocast-symbol.svg`: on macOS (case-insensitive) that name collides with `../Neocast-Symbol.svg`.
