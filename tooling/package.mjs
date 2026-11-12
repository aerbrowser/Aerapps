import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.join(root,'apps/excalidraw'), pkg=JSON.parse(await fs.readFile(path.join(app,'package.json')));
const out=path.join(root,'dist'), stage=path.join(out,`excalidraw-${pkg.version}`);
const keyPath=process.env.AER_APPS_SIGNING_KEY;
if(!keyPath)throw new Error('Set AER_APPS_SIGNING_KEY to the private signing key file. Never commit it.');
const privateKey=createPrivateKey(await fs.readFile(keyPath));
const publicKey=createPublicKey(privateKey).export({format:'jwk'});
const publicBytes=Buffer.concat([Buffer.from([4]),Buffer.from(publicKey.x,'base64url'),Buffer.from(publicKey.y,'base64url')]);
const keyId=createHash('sha256').update(publicBytes).digest('hex').slice(0,16);
execFileSync('npm',['run','build'],{cwd:app,stdio:'inherit'});
await fs.rm(stage,{force:true,recursive:true});await fs.mkdir(stage,{recursive:true});
await fs.cp(path.join(app,'dist'),path.join(stage,'ui'),{recursive:true});
await fs.cp(path.join(app,'node_modules/@excalidraw/excalidraw/dist/prod/fonts'),path.join(stage,'ui/fonts'),{recursive:true});
await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({id:'excalidraw',name:'Excalidraw',version:pkg.version,upstreamVersion:pkg.dependencies['@excalidraw/excalidraw'],hostAPI:1,dataSchema:1,entry:'ui/index.html'},null,2)+'\n');
const licenses=path.join(stage,'licenses');await fs.mkdir(licenses,{recursive:true});
async function collect(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const child=path.join(dir,entry.name);if(entry.isDirectory()){if(entry.name.startsWith('@'))await collect(child);else {try{const info=JSON.parse(await fs.readFile(path.join(child,'package.json')));let notice=`${info.name} ${info.version}\nLicense: ${info.license||'See source'}\n`;for(const file of await fs.readdir(child))if(/^(license|copying|notice)(\.|$)/i.test(file)){const stat=await fs.stat(path.join(child,file));if(stat.isFile())notice+='\n'+await fs.readFile(path.join(child,file),'utf8');}await fs.writeFile(path.join(licenses,info.name.replaceAll('/','_')+'-'+info.version+'.txt'),notice);try{await collect(path.join(child,'node_modules'));}catch{}}catch{} }}}}
await collect(path.join(app,'node_modules'));
const archive=path.join(out,`excalidraw-${pkg.version}.aerapp`);
execFileSync('python3',['-c',`import os,sys,zipfile,stat
root,out=sys.argv[1:]
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for folder,dirs,files in os.walk(root):
  dirs.sort()
  for name in sorted(files):
   p=os.path.join(folder,name)
   if os.path.islink(p): raise Exception('No symbolic links')
   info=zipfile.ZipInfo(os.path.relpath(p,root),(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o644)<<16
   with open(p,'rb') as f:z.writestr(info,f.read())
`,stage,archive]);
const bytes=await fs.readFile(archive),now=Math.floor(Date.now()/1000);
const release={id:'excalidraw',version:pkg.version,hostAPI:1,dataSchema:1,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:`https://github.com/aerbrowser/Aerapps/releases/download/excalidraw-v${pkg.version}/excalidraw-${pkg.version}.aerapp`};
const payload=Buffer.from(JSON.stringify({schema:1,channel:'stable',sequence:Number(process.env.AER_APPS_SEQUENCE||now),issuedAt:now,expiresAt:now+90*86400,apps:[release]}));
await fs.mkdir(path.join(root,'catalog'),{recursive:true});
await fs.writeFile(path.join(root,'catalog/stable.json'),JSON.stringify({keyId,payload:payload.toString('base64'),signature:sign('sha256',payload,privateKey).toString('base64')},null,2)+'\n');
await fs.writeFile(path.join(root,'catalog/trust.json'),JSON.stringify({[keyId]:publicBytes.toString('base64')},null,2)+'\n');
console.log(JSON.stringify({archive,...release,keyId},null,2));
