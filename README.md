# STARLING New Tab

Every site you care about is a planet. This fork is a **Chrome / Edge New Tab** extension — same solar system, meant to be your homepage.

Nothing leaves the browser. No account.

## Live demo

https://ethaenall.github.io/starling/

Open that URL from any machine. Your planets stay in that browser (localStorage). This is the website build, not the Chrome new-tab override.

## Install (unpacked)

1. `npm install`
2. `npm run build`
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
4. Pick the `dist/` folder

Every new tab should open STARLING.

## Use it as your homepage

Chrome has no separate “homepage extension” slot. Set:

- **On startup** → Open the New Tab page  
- **Appearance → Show home button** → set homepage to `chrome://newtab`

Home and New Tab both become your sky.

## Dev

```bash
npm run dev
```

Still a normal site at localhost. Load `dist/` when you want the real new-tab behavior (click a planet → this tab goes there).
