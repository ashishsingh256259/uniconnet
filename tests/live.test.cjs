const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'), js=fs.readFileSync('live.js','utf8');
test('live script parses and UI is gated before auth',()=>{
 new vm.Script(js);
 assert.match(html, /id="app" hidden/);
 assert.match(html, /<script src="live.js"><\/script>/);
});
test('every static element lookup resolves',()=>{
 for(const m of js.matchAll(/\bel\('([A-Za-z][\w-]*)'\)/g)) assert.ok(html.includes('id="'+m[1]+'"'),m[1]);
});
test('public key only; no browser AI provider request',()=>{
 assert.match(js,/sb_publishable_/);
 assert.doesNotMatch(js,/service_role|sb_secret_/);
 assert.doesNotMatch(html,/api\.anthropic\.com/);
});
test('initial boot is safe with no session',()=>{
 const elements=new Map();
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,value:'',textContent:'',classList:{remove(){}},replaceChildren(){},addEventListener(){}});return elements.get(id);},querySelectorAll(){return [];}};
 const context=vm.createContext({document,window:{},setInterval(){},closeAI(){},doubts:[],notices:[],polls:[],contacts:[],resources:[],isTeacher:false});
 new vm.Script(js).runInContext(context);
 assert.equal(elements.get('app').hidden,true);
 assert.equal(elements.get('liveAuth').hidden,false);
 assert.equal(typeof context.window.submitDoubt,'function');
 assert.equal(typeof context.window.sendDM,'function');
});
