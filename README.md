# Who Has The Biggest Brain? — iPad Preservation PWA

A self-hosted/offline-capable wrapper for the preserved 2009 Playfish Flash game using Ruffle WebAssembly.

## Provenance
- Game item: https://archive.org/details/whtbb
- SWF: https://archive.org/download/whtbb/brain_game_2_6_7_translated_v1.swf
- Optional cover: https://archive.org/download/whtbb/00_coverscreenshot.png
- Ruffle: official `v0.3.0` `ruffle-0.3.0-web-selfhosted.zip` release asset (the version used by the preservation guide).

The build script fetches those exact sources. After deployment the browser loads only local paths from the deployed app.

## Local Mac/PC test
Run `bash scripts/fetch-assets.sh`, then `python3 -m http.server 8080`, and open http://localhost:8080.

Note: iPad service workers require a secure context, so for Home Screen installation + dependable offline mode use an HTTPS deployment (for example Vercel). A plain `http://192.168.x.x` LAN address is fine for visual testing but is not a dependable install/offline PWA origin on iPadOS.

## iPad
1. Open the HTTPS deployment in Safari.
2. Tap **Play** once while online. This triggers caching of the SWF and the local Ruffle JS/WASM files.
3. Tap **Share** → **Add to Home Screen** → **Add**.
4. Launch it from the Home Screen from then on.

## Integrity
Expected SWF size: `1,771,296 bytes`  
Expected SHA-256: `a2bc047379274cc0f1556749c326b47d971849aa4a87c70a88da80aca448af96`
