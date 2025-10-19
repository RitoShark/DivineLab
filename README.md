# DivineLab - League of Legends Modding Suite

A comprehensive toolkit for League of Legends modding and visual effects editing, built with Electron and React.

## ⚠️ IMPORTANT SETUP REQUIRED ⚠️

**Before using any features, you MUST configure the following in Settings:**

1. **Ritobin Folder**: Set your ritobin directory
2. **Hashes Folder**: Set your hashes directory (most likely in the same direction as ritobin)

**These settings are required for most DivineLab features to function properly!**

## 🔗 Key Dependencies & Credits

- **[LtMAO](https://github.com/tarngaina/LtMAO)** - For foundational modding tools and inspiration
- **Special thanks to [tarngaina](https://github.com/tarngaina)** for letting me use his tools
- **[Upscayl](https://github.com/upscayl)** - Free and open source AI Image Upscaler for Linux, MacOS and Windows
- **[Upscayl NCNN](https://github.com/upscayl/upscayl-ncnn)** - The Upscayl backend powered by the NCNN framework and Real-ESRGAN architecture

## 🚀 Main Features

### Settings
- **Own Theme Creator**: Create and customize your own themes with full control over colors, fonts, and styling
- **Font Manager**: Manage and customize fonts throughout the application
- **Page Visibility**: Control which pages and features are visible in the interface

### Paint - Advanced Particle Recoloring
- **Recolor Particles**: Mainly focused on recoloring particle effects with precision
- **Shades Generator**: Create custom shades and color variations
- **Shift Hue**: Shifts hue while keeping lightness and saturation intact for consistent results
- **Backup Button**: Located in bottom right corner for quick saves
- **Blend Mode Selection**: Choose blend modes for specific coloring effects (e.g., blendmode 1 for black coloring)
- **Random Gradient**: Places colors randomly with customizable color count
- **Image Texture Preview**: Hover over image symbol for instant texture preview
- **Search Functionality**: Search for emitter names, vfxsystem names, and texture names
- **Custom Palettes**: Create and save your own color palettes for reuse

### Port - Advanced VFX Porting
- **Load Target & Donor**: Load target and donor bin files for porting operations
- **Port Emitters**: Transfer individual emitters between projects
- **Port VFXSystems**: Drag and drop entire vfxsystems from donor to target
- **Automatic Asset Management**: Automatically places textures into your target bin project folder
- **Persistent Effects**: Add persistent effects via bottom right persistent button
- **Idle Particle Setup**: Set vfxsystem as Idle particle
- **Matrix Support**: Add matrix transformations to vfxsystems
- **Child Emitters**: Create child emitters for child particles
- **Advanced Filtering**: Filter by emitter name, vfxsystem name, texture name
- **Empty VFXSystem Creation**: Create empty vfxsystems for nesting with emitters

### VfxHub - Community VFX Database
- **Upload VFXSystems**: Upload vfxsystems to GitHub-hosted database
- **Image Support**: Add images to vfxsystems for better organization
- **Download Menu**: Access uploaded vfxsystems from the top download menu
- **Community Sharing**: Share and discover vfxsystems from other users
- **Full Port Functionality**: Includes all features from the Port section

### Bumpath - Mod Repathing
- **LtMAO Integration**: Taken from LtMAO for reliable mod repathing
- **Path Management**: Repath your mod files efficiently
- **Compatibility**: Ensures mod compatibility across different setups

### Bineditor - Parameter Scaling
- **Emitter & VFXSystem Selection**: Select either emitters or vfxsystems for editing
- **Scale Operations**: Scale birthscale and scale by desired values (e.g., 2x multiplier)
- **Matrix Bug Fixes**: Useful when matrix transformations don't work properly
- **Batch Processing**: Apply scaling to multiple elements at once

### Frog Image - Batch Image Processing
- **Folder Loading**: Load folders containing tex dds files
- **Batch Recoloring**: Automatically recolor images in batch process

### Upscale - AI-Powered Image Enhancement
- **Upscayl Integration**: Powered by Upscayl for high-quality image upscaling
- **Batch Processing**: Upscale multiple images at once
- **Quality Preservation**: Maintains image quality during upscaling

### RGBA - Color Code Generator
- **Color Picker**: Pick any color with alpha value support
- **League RGB Codes**: Get League of Legends RGB color codes
- **Alpha Support**: Full alpha channel support for transparency

### HUD Editor - Advanced Interface Editing
- **⚠️ Experimental**: Complex project requiring standalone program
- **Advanced Features**: Attempt at advanced HUD editing (use with caution)

### Tools - Custom Executable Integration
- **Drag & Drop Exes**: Add custom executables by drag and dropping them into the window
- **Folder Processing**: Drag and drop folders onto exes for batch processing
- **Static Mat Fix**: Store tools like staticmatfix exe for easy access
- **Custom Workflows**: Create custom processing workflows

### File Handler - Advanced File Management
Two distinct modes:

#### Randomizer Mode
- **Custom Emotes**: Perfect for creating custom emotes
- **Image Selection**: Select any amount of images for randomization
- **Target Folder**: Choose target folder for processed files
- **Batch Randomization**: Randomizes every tex or dds with provided images

#### Renamer Mode
- **Map Mod Support**: Designed for editing map mods
- **Prefix/Suffix Management**: Add or delete custom prefixes and suffixes
- **Riot Compatibility**: Handles Riot's texture naming conventions
- **Batch Renaming**: Process multiple files at once



## 🔗 Links

- **GitHub Repository**: [DivineLab](https://github.com/RitoShark/DivineLab)
- **Issues**: Report bugs and request features
- **Discussions**: Community discussions and support

---

**DivineLab** - Empowering League of Legends modders with professional-grade tools.
