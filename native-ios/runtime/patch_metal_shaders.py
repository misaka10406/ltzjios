"""Generate Vulkan GLSL 450 input consumed by Cocos Metal SPIRVUtils."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
BUILTINS={'CCGlobal':(0,0),'CCCamera':(0,1),'CCShadow':(0,2),'CCLocal':(2,0),'CCSkinningAnimation':(2,2),'CCSkinningTexture':(2,3),'CCSkinning':(2,3),'CCMorph':(2,4),'cc_jointTexture':(2,7),'cc_realtimeJoint':(2,7),'cc_PositionDisplacements':(2,8),'cc_NormalDisplacements':(2,9),'cc_TangentDisplacements':(2,10),'cc_spriteTexture':(2,12)}
IO=re.compile(r'(?m)^(\s*)(in|out)\s+((?:(?:highp|mediump|lowp|flat)\s+)*\w+)\s+(\w+)(\s*(?:\[[^\]]+\])?\s*;)')
def convert(s):
 binding=dict(BUILTINS)
 for kind in ['blocks','samplerTextures','samplers','textures','buffers','images','subpassInputs']:
  for b in s.get(kind,[]):binding[b['name']]=(1,b['binding'])
 # Assign varying slots from the complete vertex declaration list, including conditional ones.
 vary={};slot=0
 for m in IO.finditer(s['glsl3']['vert']):
  if m[2]=='out' and m[4] not in vary:
   vary[m[4]]=slot;slot+=int(re.search(r'mat(\d)',m[3])[1]) if re.search(r'mat(\d)',m[3]) else 1
 attrs={a['name']:a['location'] for a in s['attributes']}
 colors={a['name']:a['location'] for a in s['fragColors']}
 result={}
 for stage,code in s['glsl3'].items():
  def block(m):
   name=m[1];ds,b=binding[name];return f'layout(set = {ds}, binding = {b}, std140) uniform {name}'
  code=re.sub(r'layout\(std140\)\s+uniform\s+(\w+)',block,code)
  def sampler(m):
   ds,b=binding[m[2]];return f'layout(set = {ds}, binding = {b}) uniform {m[1]} {m[2]}'
  code=re.sub(r'(?m)^\s*uniform\s+((?:(?:highp|mediump|lowp)\s+)?[iu]?sampler\w+)\s+(\w+)',sampler,code)
  def io(m):
   table=attrs if stage=='vert' and m[2]=='in' else colors if stage=='frag' and m[2]=='out' else vary
   return f'{m[1]}layout(location = {table[m[4]]}) {m[2]} {m[3]} {m[4]}{m[5]}'
  code=IO.sub(io,code)
  result[stage]=code
 return result

def patch():
 count=0;files=0
 def walk(x):
  nonlocal count
  if isinstance(x,dict):
   if 'glsl3' in x and 'glsl4' not in x:x['glsl4']=convert(x);count+=1
   for v in list(x.values()):walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 for p in (ROOT/'build-input/data/assets').rglob('*.json'):
  if p.stat().st_size<3000:continue
  text=p.read_text(encoding='utf-8')
  if 'glsl3' not in text:continue
  x=json.loads(text);before=count;walk(x)
  if count>before:p.write_text(json.dumps(x,separators=(',',':'),ensure_ascii=False),encoding='utf-8');files+=1
 print(f'Metal GLSL variants generated: {count} shaders in {files} files')
if __name__=='__main__':patch()
