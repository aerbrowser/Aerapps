"""Bounded parallel range download with resumable parts and SHA-256 validation."""
import concurrent.futures,hashlib,json,pathlib,time,urllib.request,sys,os

def download(url,destination,size,sha256,headers=None,workers=6):
 target=pathlib.Path(destination);target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists() and target.stat().st_size==size and hashlib.sha256(target.read_bytes()).hexdigest()==sha256:return target
 chunk=1024*1024;parts=target.with_name(target.name+'.parts');parts.mkdir(exist_ok=True)
 deadline=time.monotonic()+1800
 def one(i):
  start=i*chunk;end=min(size,start+chunk)-1;p=parts/str(i);attempts=0
  while True:
   offset=p.stat().st_size if p.exists() else 0
   if offset==end-start+1:return
   if offset>end-start+1:raise ValueError('Oversized partial download')
   if time.monotonic()>deadline:raise TimeoutError('Download time limit reached')
   try:
    req=urllib.request.Request(url,headers={**(headers or {}),'Range':f'bytes={start+offset}-{end}','Accept-Encoding':'identity'})
    with urllib.request.urlopen(req,timeout=30) as response:
     if response.status!=206 or not response.headers.get('Content-Range','').startswith(f'bytes {start+offset}-'):raise ValueError('Upstream did not honor byte range')
     with p.open('ab') as out:
      while data:=response.read(32768):
       if out.tell()+len(data)>end-start+1:raise ValueError('Range exceeded')
       out.write(data);out.flush()
   except Exception as error:
    attempts+=1
    if attempts>20:raise RuntimeError('Range download failed after retries') from error
    time.sleep(min(attempts,5))

 count=(size+chunk-1)//chunk
 with concurrent.futures.ThreadPoolExecutor(workers) as pool:
  futures=[pool.submit(one,i) for i in range(count)]
  for number,future in enumerate(concurrent.futures.as_completed(futures),1):future.result();print(f'{target.name}: {number}/{count} parts',flush=True)
 digest=hashlib.sha256();temp=target.with_name(target.name+'.assembling')
 with temp.open('wb') as out:
  for i in range(count):
   with (parts/str(i)).open('rb') as source:
    while data:=source.read(1024*1024):digest.update(data);out.write(data)
 if temp.stat().st_size!=size or digest.hexdigest()!=sha256:raise ValueError('Downloaded file SHA-256 does not match upstream metadata')
 os.replace(temp,target)
 for i in range(count):(parts/str(i)).unlink()
 parts.rmdir();return target

if __name__=='__main__':download(sys.argv[1],sys.argv[2],int(sys.argv[3]),sys.argv[4])
