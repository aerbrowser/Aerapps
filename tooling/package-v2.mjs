import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [id,stageArg]=process.argv.slice(2);
if(!/^[a-z][a-z-]+$/.test(id||'')||!stageArg)throw Error('Usage: package-v2.mjs <app-id> <prepared-directory>');
const stage=path.resolve(stageArg),manifest=JSON.parse(await fs.readFile(path.join(stage,'manifest.json')));
if(manifest.id!==id||manifest.hostAPI!==2||manifest.platform!=='macos-arm64')throw Error('Invalid manifest');
const keyPath=process.env.AER_APPS_SIGNING_KEY;if(!keyPath)throw Error('AER_APPS_SIGNING_KEY is required');
const key=createPrivateKey(await fs.readFile(keyPath));const pub=createPublicKey(key).export({format:'jwk'});const publicBytes=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]);const keyId=createHash('sha256').update(publicBytes).digest('hex').slice(0,16);
const dist=path.join(root,'dist');await fs.mkdir(dist,{recursive:true});const archive=path.join(dist,`${id}-${manifest.version}.aerapp`);
execFileSync('python3',['-c',`import os,sys,zipfile,stat,json
root,out=sys.argv[1:]
manifest=json.load(open(os.path.join(root,'manifest.json')))
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for folder,dirs,files in os.walk(root):
  dirs[:]=sorted(d for d in dirs if d not in ['.bin','.git','__pycache__'])
  for name in sorted(files):
   p=os.path.join(folder,name);rel=os.path.relpath(p,root)
   if name.endswith('.map') or name.endswith('.d.ts') or name=='.DS_Store':continue
   if os.path.islink(p):raise Exception('Resolve package symlinks before archiving: '+rel)
   info=zipfile.ZipInfo(rel,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|(0o755 if rel in manifest.get('executables',[]) else 0o644))<<16
   with open(p,'rb') as f:z.writestr(info,f.read())
`,stage,archive],{stdio:'inherit'});
const bytes=await fs.readFile(archive),release={id,version:manifest.version,hostAPI:2,dataSchema:1,platform:manifest.platform,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:`https://github.com/aerbrowser/Aerapps/releases/download/${id}-v${manifest.version}/${id}-${manifest.version}.aerapp`};
await fs.writeFile(path.join(dist,`${id}-release.json`),JSON.stringify(release,null,2)+'\n');
const legacy=JSON.parse(await fs.readFile(path.join(root,'catalog/stable.json')));const apps=JSON.parse(Buffer.from(legacy.payload,'base64')).apps;
for(const file of (await fs.readdir(dist)).filter(x=>x.endsWith('-release.json')).sort()){const item=JSON.parse(await fs.readFile(path.join(dist,file)));const index=apps.findIndex(x=>x.id===item.id);if(index>=0)apps[index]=item;else apps.push(item);}
const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({schema:2,channel:'stable',sequence:Number(process.env.AER_APPS_SEQUENCE||now),issuedAt:now,expiresAt:now+90*86400,apps}));
await fs.mkdir(path.join(root,'catalog/v2'),{recursive:true});await fs.writeFile(path.join(root,'catalog/v2/stable.json'),JSON.stringify({keyId,payload:payload.toString('base64'),signature:sign('sha256',payload,key).toString('base64')},null,2)+'\n');console.log(JSON.stringify(release));
