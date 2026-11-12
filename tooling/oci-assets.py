"""Extract selected static assets from a pinned upstream OCI image; never run Docker."""
import urllib.request,json,sys,hashlib,pathlib,tarfile,shutil,tempfile,time
host,repo,ref=sys.argv[1:4]
base='https://'+host+'/v2/'+repo
scope='repository:'+repo+':pull'
auth='https://ghcr.io/token?scope='+scope if host=='ghcr.io' else 'https://auth.docker.io/token?service=registry.docker.io&scope='+scope
for attempt in range(5):
 try:
  token=json.load(urllib.request.urlopen(auth,timeout=30))['token'];break
 except Exception:
  if attempt==4:raise
  time.sleep(2)
def get(kind,digest):
 req=urllib.request.Request(base+'/'+kind+'/'+digest,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'})
 for attempt in range(5):
  try:return urllib.request.urlopen(req,timeout=45)
  except Exception:
   if attempt==4:raise
   time.sleep(1+attempt)
def obj(kind,ref):
 cache=pathlib.Path('.cache/aer-apps-v2-upstream/metadata')/(repo.replace('/','_')+'-'+kind+'-'+ref.replace(':','_')+'.json')
 if cache.exists():return json.loads(cache.read_text())
 result=json.load(get(kind,ref));cache.write_text(json.dumps(result));return result
manifest=obj('manifests',ref)
if 'manifests' in manifest:
 ref=next(x['digest'] for x in manifest['manifests'] if x.get('platform',{}).get('architecture')=='arm64');manifest=obj('manifests',ref)
config=obj('blobs',manifest['config']['digest'])
history=[x for x in config.get('history',[]) if not x.get('empty_layer')]
if len(sys.argv)==4:
 print(json.dumps({'manifest':ref,'layers':[dict(x,created_by=history[i].get('created_by')) for i,x in enumerate(manifest['layers'])]},indent=2));sys.exit()
layer,prefix,destination=sys.argv[4:7];layer=int(layer);desc=manifest['layers'][layer];out=pathlib.Path(destination);out.mkdir(parents=True,exist_ok=True)
# Hash the complete compressed layer before accepting extracted resources.
blob=pathlib.Path('.cache/aer-apps-v2-upstream')/(desc['digest'].replace(':','_')+'.tar.gz')
from download import download
download(base+'/blobs/'+desc['digest'],blob,desc['size'],desc['digest'].split(':')[1],{'Authorization':'Bearer '+token},workers=6)
with blob.open('rb') as f:
 f.seek(0);count=0
 with tarfile.open(fileobj=f,mode='r:*') as tar:
  for member in tar:
   name=member.name.lstrip('./')
   if prefix=='--discover':
    if name.endswith('index.html') or '/static/' in name and name.endswith('.js') and count<12:print(name,flush=True);count+=1
    continue
   if not name.startswith(prefix):continue
   rel=pathlib.PurePosixPath(name[len(prefix):].lstrip('/'))
   if '..' in rel.parts or rel.is_absolute():raise ValueError('Unsafe archive path')
   if name.endswith('.map') or ('--omit-mobile' in sys.argv and rel.parts and rel.parts[0]=='mobile'):continue
   target=out.joinpath(*rel.parts)
   if member.isdir():target.mkdir(parents=True,exist_ok=True)
   elif member.isfile() or member.islnk():
    # OCI layers deduplicate identical frontend resources with hard links.
    # Resolve only links that remain inside the requested asset prefix and
    # write ordinary files; installed .aerapp archives never contain links.
    linked=member;seen=set()
    while linked.islnk():
     if linked.name in seen:raise ValueError('Cyclic asset hard link')
     seen.add(linked.name);link=pathlib.PurePosixPath(linked.linkname)
     if link.is_absolute() or '..' in link.parts or not str(link).startswith(prefix):raise ValueError('Escaping asset hard link')
     linked=tar.getmember(str(link))
    if not linked.isfile():raise ValueError('Asset hard link is not a regular file')
    target.parent.mkdir(parents=True,exist_ok=True)
    with tar.extractfile(linked) as src,target.open('wb') as dst:shutil.copyfileobj(src,dst)
    count+=1
   else:raise ValueError('Unexpected symlink or special file in assets')
 print(json.dumps({'image':host+'/'+repo,'manifest':ref,'layer':desc['digest'],'files':count,'destination':str(out)}))
