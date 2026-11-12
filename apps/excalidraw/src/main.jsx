import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './style.css';

const id = location.pathname.split('/').at(-1);
const endpoint = `/api/documents/${encodeURIComponent(id)}`;
async function request(path, options = {}) {
  const response = await fetch(path, {...options, headers: {'X-Aer-App':'document-v1', 'Content-Type':'application/json'}});
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error || '本地保存失败'), {status: response.status});
  return value;
}
function scene(elements, appState, files) {
  // Keep serializable document preferences, never transient collaboration state.
  const {viewBackgroundColor, gridSize, gridStep, gridModeEnabled, theme, scrollX, scrollY, zoom} = appState;
  return {elements, appState:{viewBackgroundColor, gridSize, gridStep, gridModeEnabled, theme, scrollX, scrollY, zoom}, files};
}
function App() {
  const [document, setDocument] = useState(null), [api,setAPI] = useState(null);
  const [editable,setEditable] = useState(false), [status,setStatus] = useState('正在打开…'), [failure,setFailure] = useState('');
  const [writer] = useState(() => ({revision:0, pending:null, saving:false, timer:null, stopped:false, title:'未命名白板', change:0, sceneKey:'', contentKey:''}));
  async function flush() {
    clearTimeout(writer.timer); writer.timer=null;
    if (writer.saving || !writer.pending || writer.stopped) return;
    writer.saving = true; setStatus('正在保存…');
    const next = writer.pending; writer.pending = null;
    try {
      const saved = await request(endpoint, {method:'PUT', body:JSON.stringify({scene:next, revision:writer.revision, title:writer.title})});
      writer.revision = saved.revision;
      setStatus(writer.pending ? '正在保存…' : '已保存到本地'); setFailure('');
    } catch (error) {
      writer.pending ||= next; setStatus('尚未保存'); setFailure(error.message);
      // A stale revision must never overwrite another tab's edits.
      if ([403,409].includes(error.status)) { writer.stopped = true; setEditable(false); }
      else writer.timer = setTimeout(flush, 3000);
    } finally { writer.saving = false; }
    if (writer.pending && !writer.stopped && !writer.timer) await flush();
  }
  useEffect(() => {
    let alive = true;
    Promise.all([request(endpoint),request('/api/status')]).then(([doc,state]) => {
      if(!alive)return; writer.revision = doc.revision; writer.title = doc.title;
      window.document.title = `${doc.title} · Excalidraw`;
      setDocument(doc);setEditable(state.editable);setStatus(state.editable?'已保存到本地':'只读 · 可导出');
    }).catch(error => setFailure(error.message));
    const unload = event => { if(writer.pending || writer.saving){event.preventDefault();event.returnValue='';} };
    const hide = () => {if(window.document.hidden)flush();};
    window.addEventListener('beforeunload',unload);window.document.addEventListener('visibilitychange',hide);
    const timer = setInterval(() => request('/api/status').then(s=>{if(alive)setEditable(s.editable && !writer.stopped);}).catch(()=>{}),30000);
    return () => {alive=false;clearInterval(timer);clearTimeout(writer.timer);window.removeEventListener('beforeunload',unload);window.document.removeEventListener('visibilitychange',hide);};
  },[]);
  useEffect(() => {
    if(!api || !document)return;
    // Invoked only by Aer after the user reviews a structured plan in the sidebar.
    window.aerApp = Object.freeze({
      snapshot: () => ({app:'excalidraw', documentId:id, revision:writer.revision, change:writer.change, elements:api.getSceneElements().map(({id,type,x,y,width,height,text})=>({id,type,x,y,width,height,text}))}),
      apply: input => {
        if(!editable || writer.stopped)throw new Error('当前文档不可编辑');
        if(input.documentId!==id || input.change!==writer.change)throw new Error('画布已变化，请重新生成方案');
        if(!Array.isArray(input.shapes) || !input.shapes.length || input.shapes.length>100)throw new Error('每次最多添加 100 个图形');
        const shapes=input.shapes.map(item=>{
          if(!['rectangle','ellipse','diamond','text','arrow','line'].includes(item.type))throw new Error('不支持的图形');
          const shape={type:item.type};
          for(const key of ['x','y','width','height']){const value=item[key]??0;if(!Number.isFinite(value)||Math.abs(value)>100000)throw new Error('坐标无效');shape[key]=value;}
          if(item.text!==undefined){if(typeof item.text!=='string'||item.text.length>2000)throw new Error('文字过长');shape.text=item.text;}
          for(const key of ['strokeColor','backgroundColor'])if(item[key]!==undefined){if(!/^#[a-f0-9]{6}$/i.test(item[key]))throw new Error('颜色无效');shape[key]=item[key];}
          if(shape.type==='text')shape.fontSize=20;
          if(['arrow','line'].includes(shape.type))shape.points=[[0,0],[shape.width,shape.height]];
          return shape;
        });
        const elements=convertToExcalidrawElements(shapes);
        api.updateScene({elements:[...api.getSceneElements(),...elements],captureUpdate:'IMMEDIATELY'});
        writer.change++; // invalidate the plan immediately, including before onChange
        api.scrollToContent(elements);return {added:elements.length};
      }
    });
    return ()=>{delete window.aerApp;};
  },[api,document,editable]);
  const exportFile=()=>{
    const current=api?scene(api.getSceneElementsIncludingDeleted(),api.getAppState(),api.getFiles()):document?.scene;
    if(!current)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify({type:'excalidraw',version:2,source:'Aer Apps',...current})],{type:'application/json'}));
    const link=window.document.createElement('a');link.href=url;link.download=`${writer.title}.excalidraw`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  async function newDocument(){await flush();if(writer.pending || writer.saving){setFailure('请等待保存完成，或先导出当前文档。');return;}try{const doc=await request('/api/documents',{method:'POST'});location.href=`/excalidraw/doc/${doc.id}`;}catch(e){setFailure(e.message);}}
  return <div className="app"><header><strong>Excalidraw</strong><span className="status" role="status">{status}</span><button onClick={newDocument} disabled={!editable}>新建</button><button onClick={exportFile} disabled={!document}>导出</button></header>{failure && <div className="error" role="alert">{failure}</div>}<main>{document && <Excalidraw excalidrawAPI={setAPI} initialData={document.scene} langCode="zh-CN" viewModeEnabled={!editable} onChange={(elements,state,files)=>{
    if(!editable || writer.stopped)return;
    const next=scene(elements,state,files), key=JSON.stringify(next);
    if(key===writer.sceneKey)return;writer.sceneKey=key;
    const contentKey=JSON.stringify([elements,files,state.viewBackgroundColor]);
    if(contentKey!==writer.contentKey){writer.contentKey=contentKey;writer.change++;}
    writer.pending=next;setStatus('尚未保存');clearTimeout(writer.timer);writer.timer=setTimeout(()=>{writer.timer=null;flush();},600);
  }} UIOptions={{canvasActions:{loadScene:editable,saveToActiveFile:false,export:{saveFileToDisk:true},toggleTheme:true}}}>
    <MainMenu><MainMenu.DefaultItems.LoadScene/><MainMenu.DefaultItems.Export/><MainMenu.DefaultItems.SaveAsImage/><MainMenu.DefaultItems.ClearCanvas/><MainMenu.DefaultItems.ToggleTheme/><MainMenu.DefaultItems.ChangeCanvasBackground/></MainMenu>
  </Excalidraw>}</main></div>;
}
createRoot(window.document.getElementById('root')).render(<App/>);
