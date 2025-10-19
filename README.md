# DivineLab

A comprehensive toolkit for League of Legends modding and visual effects editing.

## ⚠️ IMPORTANT SETUP REQUIRED ⚠️

**Before using any features, you MUST configure the following in Settings:**

1. **Hashes Folder**: Set your League of Legends hashes directory
2. **Ritobin Folder**: Set your ritobin directory

**These settings are required for most DivineLab features to function properly!**

## Credits

**Special thanks to the original developers of some Tools it uses:**

- **[tarngaina](https://github.com/tarngaina/LtMAO)** - Creator of [LtMAO](https://github.com/tarngaina/LtMAO), the foundational toolpack for League modding that inspired and contributed to this project
- **[Upscayl](https://upscayl.github.io/)** - Open-source AI image upscaling tool that powers our upscale feature

## Main Features

### Settings
- **Own Theme Creator**: Create and customize your own themes
- **Font Manager**: Manage fonts for the application
- **Page Visibility**: Control which pages are visible

### Paint
- **Recolor Particles**: Mainly for recoloring particle effects
- **Shades Generator**: Create custom shades
- **Shift Hue**: Shifts hue while keeping lightness and saturation intact
- **Backup Button**: Located in bottom right corner
- **Blend Mode Selection**: Select by blend modes (e.g., blendmode 1 for black coloring)
- **Random Gradient**: Places colors randomly with customizable color count
- **Image Texture Preview**: Hover over image symbol for preview
- **Search Functionality**: Search for emitter names, vfxsystem names, and texture names
- **Custom Palettes**: Create and save your own color palettes

### Port

- Load target and donor bin files
- Port emitters and whole vfxsystems via drag and drop
- Automatic texture placement into target bin project folder
- Add persistent effects via bottom right persistent button
- Set vfxsystem as Idle particle
- Add matrix to vfxsystem
- Create child emitters for child particles
- Filter by emitter name, vfxsystem name, texture name
- Create empty vfxsystems for nesting with emitters

### Frogchanger
- Extract assets by selecting champions and skin IDs
- Automatically repaths mods or extracts filters
- **Important**: Requires output directory defined in settings (top right corner) same as League of Legends champion folder and hashes folder

### VfxHub
- Upload vfxsystems to GitHub-hosted database
- Add images to vfxsystems
- Download menu at the top displays uploaded vfxsystems
- Includes all Stitch functionality

Working but not for public

### Bineditor
- Select emitters or vfxsystems and scale birthscale and scale by desired value (e.g., 2x)
- Useful when matrix bugs and doesn't work properly

### Frog Image
- Load folder with tex dds files
- Batch recolor images automatically

### Upscale
- Upscale images powered by Upscayl

### RGBA
- Pick a color and its alpha value to get League RGB code

### HUD Editor
- **Warning**: Failed project - too complex and needs standalone program
- Will be discontinued but is to a degree working

### Tools
- Add custom executables by drag and drop
- Drag and drop folders onto exes for processing
- Store tools like staticmatfix exe for easy access

### File Handler
Two different modes:

**Randomizer**: 
- Select multiple images and target folder
- Randomizes every tex or dds with provided images
- Great for custom emotes

**Renamer**: 
- Add or delete prefixes/suffixes from textures
- Mainly for map mods where Riot adds prefixes/suffixes

### Bumpath
- Repath your mod (taken from LtMAO)

## Getting Started

1. Set up your output directory in settings (top right corner)
2. Ensure League of Legends champion folder and hashes folder are properly configured
3. Start with Paint for basic recoloring or Port for advanced vfxsystem management

## Notes

- The HUD Editor is experimental and may cause crashes
- Some features require specific folder structures to work properly
- Custom themes and palettes can be saved for reuse