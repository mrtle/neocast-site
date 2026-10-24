# neocast.us

Company site for **Neocast**, the pro-human broadcast. Version 2 (Oct 24, 2026) leads with the flagship product, **Tastebud**, then features Neocast media: the launch film, *10 Humans vs. AI* and the newsroom VPRWRE.
Static, single page, served by GitHub Pages from the repository root (custom domain in `CNAME`). Version 1 (black and white, Montserrat) is kept on branch `v1-black-and-white`.

- `index.html`, `404.html`, `assets/site.css`: edit directly. The hero's life map is precomputed HTML/SVG (desktop and phone layouts; sizes in container units).
- Look: the Neocast house design language. Paper `#F6F3F0`, ink `#181818`, Manrope only, one accent (the brand gradient `#FD9013 → #FD3155 → #E409CF → #4315FF`) on emphasis words, primary buttons and active states, never behind UI. No lavender.
- `assets/brand/`: Martin's Oct 24, 2026 brand-standard vector logos (kit crops, unedited; see `assets/brand/README.md`). Never retype, redraw, recolour or stretch them.
- `assets/fonts/`: Manrope variable (SIL Open Font License).
- `assets/img/show/` and `assets/img/clips/`: *10 Humans vs. AI* set stills and campus reel covers (same files as 10humansvsai.com). `assets/img/founder.jpg`: founder photo. `assets/img/og.png`: share image.
- The launch film loads from YouTube only when someone presses play.
- The VPRWRE list shows four built-in stories and swaps in the newest four from `https://vprwre.com/posts.json` in the browser when it can.
- Get Tastebud links go to `https://neocast.live/tastebud`; the setup prompt points assistants at `https://neocast.live/tastebud/skill`.
