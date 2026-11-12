"""Adapt the pinned official AFFiNE frontend for local workspace operation.

Usage: prepare-affine.py <stage/ui> <verified-NotoSansSC.ttf>
Build-only dependencies: fonttools==4.68.0, brotli==1.2.1.
The host supplies COOP/COEP, SPA routing and an authenticated stable origin.
"""
from pathlib import Path
import sys,re,hashlib,json,shutil
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
ui=Path(sys.argv[1]);noto=Path(sys.argv[2]);source=Path(__file__).resolve().parent.parent/'apps/affine'
data=noto.read_bytes()
if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!='fb0637bafbcd804fe32152370a1225990745b4bc':raise ValueError('Unexpected Google Fonts source')
for p in ui.rglob('*'):
 if p.suffix in ['.js','.css','.html','.json']:
  s=p.read_text();s=s.replace('https://prod.affineassets.com/','/').replace('https://cdn.affine.pro/fonts/','/fonts/').replace('SarasaGothicCL-Regular.ttf','NotoSansSC-Regular.ttf')
  if p.name=='index.html' and p.parent==ui:
   s=re.sub(r'<link[^>]*rel="preconnect"[^>]*>','',s)
   s=re.sub(r'<meta name="env:isSelfHosted"[^>]*>','',s)
   s=s.replace('<head>','<head>\n<meta name="env:isSelfHosted" content="false">').replace('rel="manifest"','rel="manifest" crossorigin="use-credentials"')
  p.write_text(s)
for name in ['Inter-Regular','Inter-SemiBold','Inter-Italic','Inter-SemiBoldItalic']:
 font=TTFont(ui/'fonts'/(name+'.woff2'));font.flavor='woff';font.save(ui/'fonts'/(name+'.woff'))
font=instantiateVariableFont(TTFont(noto),{'wght':400},inplace=True);font.save(ui/'fonts/NotoSansSC-Regular.ttf')
(ui.parent/'licenses').mkdir(exist_ok=True)
shutil.copy2(source/'NotoSansSC-OFL.txt',ui.parent/'licenses/NotoSansSC-OFL.txt')
shutil.copy2(source/'UPSTREAM-LICENSE',ui.parent/'licenses/UPSTREAM-LICENSE')
shutil.copy2(source/'app.json',ui.parent/'manifest.json');shutil.copy2(source/'upstream.json',ui.parent/'upstream.json')
print('AFFiNE local workspace assets prepared; cloud server features are not bundled.')
