# Provenance — Who Has The Biggest Brain?

This package is a preservation wrapper, not a remaster.

## Original work
- **Game:** Who Has The Biggest Brain?
- **Developer:** Playfish
- **Original era:** 2009 Facebook game

## Preserved offline build
Source record: https://archive.org/details/whtbb

The Internet Archive item credits:
- **PandaFake⚡** — archived the game, modified it to function offline, and uploaded the preservation item.
- **BattleAncient (Rachid)** — supplied the main game file.
- **floydian (Alejandro)** — helped repair glitches.
- **Ruffle contributors** — maintain the open-source Flash emulator used to run the SWF in modern browsers.

The Archive item records the 9/8/25 update as fixing the Car Path sign glitch, adding the Hexagon Path reset sequence, and removing obsolete score/upload interfaces.

## Binary identity
- File: `games/whtbb/brain_game_2_6_7_translated_v1.swf`
- Expected size: `1,771,296 bytes`
- Expected SHA-256: `a2bc047379274cc0f1556749c326b47d971849aa4a87c70a88da80aca448af96`

## Emulator
Pinned to Ruffle `v0.3.0` self-hosted web release, matching the documented preservation implementation.

## Runtime independence
After a successful build/deployment, the app loads the SWF, Ruffle JavaScript and Ruffle WebAssembly from local paths on the same origin. Archive.org and GitHub are provenance/build-time sources only and are not required during play.
