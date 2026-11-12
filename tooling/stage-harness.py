"""Prepare a self-contained macOS arm64 Harness payload from locked inputs.

Usage: stage-harness.py <node-directory> <python-install-only.tar.gz> <stage>
Run npm ci --omit=dev --ignore-scripts in apps/deepseek-harness first.
No package installation, compilation, or runtime download runs on user machines.
"""
import hashlib,json,os,pathlib,shutil,sys,tarfile

base=pathlib.Path(__file__).resolve().parent.parent
node,python_archive,destination=map(pathlib.Path,sys.argv[1:])
destination.mkdir(parents=True,exist_ok=True)
if any(destination.iterdir()):raise ValueError('Use an empty staging directory')
source=base/'apps/deepseek-harness'
python_sha='768f05cf200273bbdda9a5955a5a6892a4b22f2a0b1e4b0a9160f5c7fce86816'
if hashlib.sha256(python_archive.read_bytes()).hexdigest()!=python_sha:raise ValueError('Python archive checksum mismatch')

def copy_tree(src,dst,root):
 for p in sorted(src.iterdir()):
  if p.name in ['.bin','.git','__pycache__'] or p.name.endswith(('.map','.d.ts','.pyc')):continue
  if p.is_symlink():
   resolved=p.resolve()
   if not resolved.is_relative_to(root.resolve()):raise ValueError('Escaping dependency link: '+str(p))
  else:resolved=p
  target=dst/p.name
  if resolved.is_dir():target.mkdir(parents=True,exist_ok=True);copy_tree(resolved,target,root)
  elif resolved.is_file():
   target.parent.mkdir(parents=True,exist_ok=True)
   # Hard links save build-machine space; ZIP entries remain ordinary files.
   os.link(resolved,target)

copy_tree(source/'node_modules',destination/'server/node_modules',source/'node_modules')
(destination/'runtime/bin').mkdir(parents=True)
shutil.copy2(node/'bin/node',destination/'runtime/bin/node')
(destination/'licenses').mkdir()
if (node/'LICENSE').exists():shutil.copy2(node/'LICENSE',destination/'licenses/Node-LICENSE')
else:
 with tarfile.open(node.with_name(node.name+'.tar.gz')) as tar:
  (destination/'licenses/Node-LICENSE').write_bytes(tar.extractfile(node.name+'/LICENSE').read())
shutil.copy2(source/'node_modules/@deepseek-ai/dsh/LICENSE',destination/'licenses/Harness-LICENSE')
shutil.copy2(source/'package-lock.json',destination/'dependency-lock.json')

# npm ships with the pinned Node distribution. pnpm is an explicit locked
# dependency because Harness uses it for plugin management.
with tarfile.open(node.with_name(node.name+'.tar.gz')) as tar:
 prefix=node.name+'/lib/node_modules/npm/'
 for member in tar:
  if not member.name.startswith(prefix) or not member.isfile():continue
  rel=pathlib.PurePosixPath(member.name[len(prefix):])
  if '..' in rel.parts or rel.is_absolute():raise ValueError('Unsafe npm path')
  target=destination/'runtime/node_modules/npm'/rel;target.parent.mkdir(parents=True,exist_ok=True)
  with tar.extractfile(member) as inp,target.open('wb') as out:shutil.copyfileobj(inp,out)
wrappers={
 'npm':'"$runtime/bin/node" "$runtime/node_modules/npm/bin/npm-cli.js"',
 'npx':'"$runtime/bin/node" "$runtime/node_modules/npm/bin/npx-cli.js"',
 'pnpm':'"$runtime/bin/node" "$runtime/../server/node_modules/pnpm/bin/pnpm.mjs"',
 'pnpx':'"$runtime/bin/node" "$runtime/../server/node_modules/pnpm/bin/pnpx.mjs"',
 'pip':'"$runtime/python/bin/python3" -m pip',
 'pip3':'"$runtime/python/bin/python3" -m pip',
}
for name,command in wrappers.items():
 (destination/'runtime/bin'/name).write_text('#!/bin/sh\nruntime="$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)"\nexec '+command+' "$@"\n')

# Materialize validated archive aliases so installed packages never contain links.
with tarfile.open(python_archive) as tar:
 members={m.name:m for m in tar}
 def resolve(member,seen=None):
  seen=set() if seen is None else seen
  if member.name in seen:raise ValueError('Cyclic Python link')
  seen.add(member.name)
  if member.islnk() or member.issym():
   name=member.linkname if member.islnk() else str(pathlib.PurePosixPath(member.name).parent/member.linkname)
   name=os.path.normpath(name)
   if not name.startswith('python/'):raise ValueError('Escaping Python alias')
   return resolve(members[name],seen)
  if not member.isfile():raise ValueError('Unsupported Python member')
  return member
 for name,m in members.items():
  rel=pathlib.PurePosixPath(name)
  if '..' in rel.parts or rel.is_absolute() or rel.parts[0]!='python':raise ValueError('Unsafe Python path')
  if m.isdir() or '__pycache__' in rel.parts or name.endswith('.pyc') or '/share/' in name or '/include/' in name:continue
  original=resolve(m);target=destination/'runtime'/rel
  target.parent.mkdir(parents=True,exist_ok=True)
  with tar.extractfile(original) as inp,target.open('wb') as out:shutil.copyfileobj(inp,out)

manifest=json.loads((source/'app.json').read_text())
manifest['runtime']['env']['PATH']='${PACKAGE}/runtime/bin:${PACKAGE}/runtime/python/bin:/usr/bin:/bin'
manifest['runtime']['env']['PYTHONNOUSERSITE']='1'
manifest['runtime']['env']['NPM_CONFIG_CACHE']='${DATA}/cache/npm'
manifest['runtime']['env']['NPM_CONFIG_PREFIX']='${DATA}/tools'
manifest['runtime']['env']['PNPM_HOME']='${DATA}/pnpm'
manifest['executables']=[]
count=total=0
for p in destination.rglob('*'):
 if not p.is_file():continue
 count+=1;total+=p.stat().st_size
 with p.open('rb') as f:header=f.read(16)
 if (header[:4]==b'\xcf\xfa\xed\xfe' and int.from_bytes(header[12:16],'little')==2) or str(p.relative_to(destination))=='runtime/bin/node':
  manifest['executables'].append(str(p.relative_to(destination)))
manifest['executables'].sort()
manifest['executables']+=['runtime/bin/'+name for name in wrappers]
if count>80000 or total>1024**3:raise ValueError('Payload exceeds host limits')
(destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
upstream={'npm':'@deepseek-ai/dsh@0.2.2-rc.1','lockfile':'dependency-lock.json','node':'24.22.2','python':{'version':'3.11.16','build':'20260901','sha256':python_sha,'source':'https://github.com/astral-sh/python-build-standalone/releases/tag/20260901'},'platform':'macos-arm64'}
upstream['pnpm']=json.loads((source/'node_modules/pnpm/package.json').read_text())['version']
upstream['npmCLI']=json.loads((destination/'runtime/node_modules/npm/package.json').read_text())['version']
(destination/'upstream.json').write_text(json.dumps(upstream,indent=2)+'\n')
print(json.dumps({'files':count,'expandedBytes':total,'executables':manifest['executables']}))
