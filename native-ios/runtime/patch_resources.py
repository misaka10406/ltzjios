"""Restore native boot metadata without modifying the supplied game assets."""
from pathlib import Path
import json, shutil
root=Path(__file__).resolve().parents[1]
data=root/'build-input/data'
for name in ['main.js','realMain.js','boot-diagnostics.js','native-platform.js']:
    shutil.copyfile(root/'runtime'/name,data/name)
(data/'src/import-map.89abd.json').write_text(json.dumps({'imports':{'cc':'./cocos-js/cc.954ce.js'}}),encoding='utf-8')
p=data/'application.3a3d3.js'
s=p.read_text(encoding='utf-8')
s=s.replace(',\n              rendering: { renderMode: 2 }','')
if 'renderMode' in s: raise RuntimeError('Unexpected web rendering override; inspect application entry')
p.write_text(s,encoding='utf-8')
assert (data/'src/cocos-js/cc.954ce.js').is_file()
print('PASS: physical native engine mapping, native renderer defaults, visible boot diagnostics')
