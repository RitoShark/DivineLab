# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\Frog\\Desktop\\Projects coding\\DivineLab-main\\bumpath_backend_standalone_final.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['pyzstd', 'xxhash', 'PIL', 'PIL.Image', 'flask', 'flask_cors', 'requests', 'pyRitoFile.bin', 'pyRitoFile.wad', 'pyRitoFile.stream', 'pyRitoFile.structs', 'pyRitoFile.helper', 'pyRitoFile.anm', 'pyRitoFile.skl', 'pyRitoFile.skn', 'pyRitoFile.tex', 'LtMAO.bumpath', 'LtMAO.hash_helper', 'LtMAO.lepath', 'LtMAO.wad_tool', 'LtMAO.texsmart', 'LtMAO.Ritoddstex'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='bumpath_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
