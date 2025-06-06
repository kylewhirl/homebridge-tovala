# Changelog
All notable changes to **homebridge-tovala-smart-oven** will be documented in this file.

## [1.0.11] – 2025‑06‑06
### Added
- **“Oven Done”** motion‑sensor accessory that announces when a cook cycle finishes.
- `enableDoneSensor` flag (defaults to `true`) to turn the motion sensor on/off.
- `doneSensorPoll` interval setting (seconds) to control idle‑state polling.
- State‑based polling logic that schedules a single pre‑finish check instead of constant polling.

## [1.0.8] – 2025‑04‑16
### Added
- `groupAccessories` flag now fully purges legacy accessories when switched.  
- Changelog support (this file!).

### Fixed
- Stand‑alone recipe switches sometimes re‑appearing after a grouped install.
