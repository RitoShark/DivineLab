# DivineLab

Electron + React app for League of Legends modding: particle recoloring, texture conversion, and .bin utilities.

## Features
- Particle recoloring with multiple color modes
- Texture conversion (DDS ↔ PNG ↔ TEX)
- Batch processing and previews
- .bin helpers (convert/edit), app preferences

## Requirements
- Node.js 16+
- Ritobin CLI (for .bin workflows)
- LtMAO by tarngaina (for texture conversion)

## Setup
```bash
git clone https://github.com/RitoShark/DivineLab.git
cd DivineLab
npm install
```

### LtMAO placement
- This repo ignores `LtMAO-hai/` to keep size small.
- Place `LtMAO-hai/` in the project root with at least:
  - `cpy-minimal/python.exe` (and the rest of the minimal runtime)
  - `src/cli.py`
  - `src/LtMAO/` modules required by the CLI (e.g., `pyntex.py`, `Ritoddstex.py`, `texsmart.py`, `pyRitoFile/*`)
- Alternatively, run `create-minimal-ltmao.bat` to create a minimal folder from a full LtMAO checkout.

LtMAO: https://github.com/tarngaina/LtMAO

## Run
```bash
npm run dev   # Electron + CRA dev
# or
npm run build # CRA production build
npm run package # Electron package
```

## Configuration
- On first use you’ll be prompted to select `ritobin_cli.exe`.
- LtMAO is auto-detected at `./LtMAO-hai`.

## Attribution
- Uses LtMAO by tarngaina.

## Disclaimer
For modding and educational purposes. Respect Riot Games’ terms of service.
