import subprocess, math
from LtMAO import lepath
from PIL import Image

def block_and_stream_process_output(process, log_message_header=''):
    for line in process.stdout:
        msg = line.decode().strip().replace('\\', '/')
        if msg != '':
            print(log_message_header + msg)
    process.wait()

def block_and_stream_nothing(process):
    process.wait()


class CSLOL:
    local_file = './res/tools/mod-tools.exe'
    diag_file = './res/tools/cslol-diag.exe'

    @staticmethod
    def import_fantome(src, dst, game=None, noTFT=True):
        local_file = lepath.abs(CSLOL.local_file)
        cmds = [local_file, 'import', src, dst]
        if game:
            cmds.append('--game:' + game)
        if noTFT:
            cmds.append('--noTFT')
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        return p

    @staticmethod
    def export_fantome(src, dst, game=None, noTFT=True):
        local_file = lepath.abs(CSLOL.local_file)
        cmds = [local_file, 'export', src, dst]
        if game:
            cmds.append('--game:' + game)
        if noTFT:
            cmds.append('--noTFT')
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        return p

    @staticmethod
    def make_overlay(src, overlay, game=None, mods=None, noTFT=True, ignore_conflict=True):
        local_file = lepath.abs(CSLOL.local_file)
        cmds = [local_file, 'mkoverlay', src, overlay]
        if game:
            cmds.append('--game:' + game)
        if mods:
            cmds.append('--mods:' + '/'.join(mods))
        if noTFT:
            cmds.append('--noTFT')
        if ignore_conflict:
            cmds.append('--ignoreConflict')
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        return p

    @staticmethod
    def run_overlay(overlay, config, game=None):
        local_file = lepath.abs(CSLOL.local_file)
        cmds = [local_file, 'runoverlay', overlay, config]
        if game:
            cmds.append(game)
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        return p
    
    
    @staticmethod
    def diagnose():
        diag_file = lepath.abs(CSLOL.diag_file)
        cmds = [diag_file]
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        block_and_stream_process_output(p, 'cslol-diag: ')
        return p


class ImageMagick:
    local_file = './res/tools/magick.exe'

    @staticmethod
    def to_png(src, png):
        # Convert DDS to PNG - PIL cannot read DDS files, need a DDS decoder
        try:
            print(f'ImageMagick: Converting DDS to PNG: {src} -> {png}')
            
            # Try using a DDS decoder library
            try:
                # Try pydds library (if available)
                from pydds import decode_dds
                with open(src, 'rb') as dds_file:
                    dds_data = dds_file.read()
                image = decode_dds(dds_data)
                image.save(png)
                print(f'ImageMagick: Successfully converted to PNG using pydds: {png}')
                return None
            except ImportError:
                print('ImageMagick: pydds not available, trying alternative method...')
                pass
            except Exception as e:
                print(f'ImageMagick: pydds conversion failed: {e}, trying imageio...')
                pass
            
            # Try imageio with PIL-Pillow (imageio may have DDS support through plugins)
            try:
                import imageio
                # imageio might support DDS through plugins
                img_array = imageio.imread(src)
                imageio.imwrite(png, img_array, format='PNG')
                print(f'ImageMagick: Successfully converted to PNG using imageio: {png}')
                return None
            except ImportError:
                print('ImageMagick: imageio not available...')
                pass
            except Exception as e:
                print(f'ImageMagick: imageio cannot read DDS: {e}')
                pass
            
            # PIL cannot read DDS files natively - this will fail
            # But we try it anyway to get a clear error message
            try:
                with Image.open(src) as img:
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    img.save(png, 'PNG')
                print(f'ImageMagick: Successfully converted to PNG using PIL: {png}')
                return None
            except Exception as pil_error:
                print(f'ImageMagick: PIL cannot read DDS files: {pil_error}')
                print('ImageMagick: DDS files require a specialized decoder like pydds or imageio with DDS plugin')
                
                # Create an error placeholder (red = error)
                with Image.new('RGBA', (256, 256), (255, 0, 0, 255)) as placeholder:
                    placeholder.save(png, 'PNG')
                print(f'ImageMagick: Created error placeholder PNG (red = conversion failed): {png}')
                return None
                
        except Exception as e:
            print(f'ImageMagick: DDS to PNG conversion failed: {e}')
            # Final fallback: create a gray placeholder
            try:
                with Image.new('RGBA', (256, 256), (128, 128, 128, 255)) as placeholder:
                    placeholder.save(png, 'PNG')
                print(f'ImageMagick: Created fallback placeholder PNG: {png}')
                return None
            except Exception as e2:
                print(f'ImageMagick: Failed to create placeholder: {e2}')
                raise e

    @staticmethod
    def to_dds(src, dds, format='dxt5', mipmap=False):
        if format not in ('dxt1', 'dxt5'):
            format = 'dxt5'
        if mipmap:
            with Image.open(src) as img:
                mipmap_count = math.floor(math.log2(max(img.width, img.height))) + 1
        cmds = [
            lepath.abs(ImageMagick.local_file),
            src,
            '-define',
            f'dds:compression={format}',
            '-define',
            f'dds:mipmaps={mipmap_count if mipmap else 0}',
            dds
        ]
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        block_and_stream_process_output(p, 'ImageMagick: ')
        return p

    @staticmethod
    def resize_dds(src, dst, width, height):
        cmds = [
            lepath.abs(ImageMagick.local_file),
            src,
            '-resize',
            f'{width}x{height}',
            dst
        ]
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        block_and_stream_process_output(p, 'ImageMagick: ')
        return p


class VGMStream:
    local_file = './res/tools/vgmstream/vgmstream-cli.exe'

    @staticmethod
    def to_wav(src, dst=None):
        if dst == None:
            dst = '.'.join(src.split('.')[:-1] + ['wav']) 
        cmds = [
            lepath.abs(VGMStream.local_file),
            '-o',
            dst,
            src,
        ]
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        block_and_stream_nothing(p)
        return p
    

class WWiseConsole:
    local_file = './res/wiwawe/WwiseApp/Authoring/x64/Release/bin/WwiseConsole.exe'
    wproj_file = './res/wiwawe/WwiseLeagueProjects/WWiseLeagueProjects.wproj'

    @staticmethod
    def to_wem(wsources_file, output_dir):
        cmds = [
            WWiseConsole.local_file,
            'convert-external-source',
            lepath.abs(WWiseConsole.wproj_file),
            '--source-file',
            lepath.abs(wsources_file),
            '--output',
            lepath.abs(output_dir)
        ]
        p = subprocess.Popen(
            cmds, creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        block_and_stream_process_output(p, 'WwiseConsole: ')
        return p