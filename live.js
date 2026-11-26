'use strict';
// Publishable key only; all authorization is enforced by database RLS.
const API = 'https://zvqjwnedribwxelnmvkx.supabase.co';
const PUBLIC_KEY = 'sb_publishable_1E4vMVnMRmMVv9p3tjH3lA_SmpEMuxr';
let session = null, profile = null, busy = false, refreshing = null, generation = 0;
const el = id => document.getElementById(id);
const values = id => el(id).value.trim();
const timeLabel = t => new Date(t).toLocaleString();
const replaceRows = (target, rows) => target.splice(0,target.length,...rows);
function notify(message) { el('liveStatus').textContent = message; }
async function request(path, options = {}, token = session?.access_token) {
  const response = await fetch(API + path, {...options, headers: {apikey: PUBLIC_KEY, 'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {}), ...options.headers}});
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error('Unexpected server response'); }
  if (!response.ok) throw new Error(data?.message || data?.msg || data?.error_description || 'Request failed ('+response.status+')');
  return data;
}
async function ensureSession() {
  if (!session) throw new Error('Please sign in');
  if (Date.now() < session.expiresAt - 60000) return;
  if (!refreshing) {
    const current = session;
    refreshing = request('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:JSON.stringify({refresh_token:current.refresh_token})}, null)
      .then(data => { if(session !== current) throw new Error('Session ended'); setSession(data); })
      .finally(()=>{refreshing=null;});
  }
  await refreshing;
}
function setSession(data) { session = {...data,expiresAt:Date.now()+Number(data.expires_in||3600)*1000}; }
async function db(path,method='GET',body,representation=false) {
  await ensureSession();
  return request('/rest/v1/'+path,{method, ...(body===undefined?{}:{body:JSON.stringify(body)}), headers:{Prefer:representation?'return=representation':'return=minimal'}});
}
async function run(action) {
  if(busy) return;
  busy=true; notify('Working…');
  try { await action(); notify('Saved / updated'); }
  catch(e){notify(e.message); alert(e.message);}
  finally{busy=false;}
}
function resetSession() {
  generation++; session=null; profile=null; isTeacher=false;
  for(const a of [doubts,notices,polls,contacts,resources]) a.length=0;
  el('liveAuth').hidden=false; el('app').hidden=true;
  for(const id of ['doubtsList','noticesList','pollsList','dmContacts','dmMessages','resourcesGrid','dmChatHeader','recentLive']) el(id).replaceChildren();
  for(const id of ['dmInput','doubtQuestion','noticeTitle','noticeText','pollQuestion','pollOptions','globalSearch','aiInput','authPassword']) el(id).value='';
  document.querySelectorAll('.modal-backdrop').forEach(m=>m.classList.remove('open'));
  closeAI(); el('aiMessages').replaceChildren();
}
async function authenticate(register) {
  const email=values('authEmail'),password=el('authPassword').value,name=values('authName');
  if(!email||password.length<8||register&&!name) { el('authStatus').textContent='Enter email, password (8+ characters), and name for signup.'; return; }
  if(busy)return; busy=true; el('authStatus').textContent='Connecting…';
  try {
    if(register){
      const result=await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password,data:{display_name:name}})},null);
      if(!result.access_token){el('authStatus').textContent='Check your email to confirm the account, then sign in.'; return;}
      setSession(result);
    }else setSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},null));
    const uid=session.user.id;
    let rows=await db('profiles?select=id,display_name,role&id=eq.'+uid);
    if(!rows.length){
      const display_name=String(session.user.user_metadata?.display_name||name||email.split('@')[0]).slice(0,100);
      await db('profiles','POST',{id:uid,display_name});
      rows=await db('profiles?select=id,display_name,role&id=eq.'+uid);
    }
    profile=rows[0]; if(!profile)throw new Error('Profile unavailable');
    isTeacher=['teacher','admin'].includes(profile.role);
    el('roleName').textContent=profile.display_name; el('roleLabel').textContent=profile.role;
    el('roleToggle').textContent='Sign out'; el('sidebarName').textContent=profile.display_name;
    el('sidebarAvatar').textContent=profile.display_name.slice(0,2).toUpperCase(); el('sidebarSub').textContent=profile.role;
    el('welcomeMsg').textContent='Welcome, '+profile.display_name+'!';
    el('authPassword').value=''; await loadAll();
    el('liveAuth').hidden=true;el('app').hidden=false;notify('Connected to UniConnect');
    goto('dashboard',document.querySelector('.nav-item')); 
  }catch(e){resetSession();el('authStatus').textContent=e.message;}finally{busy=false;}
}
async function signOut(){
  if(busy)return; busy=true;
  try{if(session)await request('/auth/v1/logout',{method:'POST'});}
  catch(e){el('authStatus').textContent='Local session cleared; server logout failed.';}
  finally{resetSession();busy=false;}
}
const ids = new Map();let nextId=1;
function localId(uuid){if(!ids.has(uuid))ids.set(uuid,nextId++);return ids.get(uuid);}
async function loadAll(){
 const owner=profile.id, epoch=generation;
 const [people,questions,answers,news,ps,opts,votes,ups,totals,ms,rs,own]=await Promise.all([
 db('profiles?select=id,display_name,role'),db('doubts?select=id,public_author_id,anonymous,question,subject,status,created_at&order=created_at.desc'),
 db('replies?select=id,doubt_id,author_id,body,created_at&order=created_at.asc'),db('notices?select=*&order=created_at.desc'),
 db('polls?select=*&order=created_at.desc'),db('poll_options?select=*'),db('poll_votes?select=*'),db('doubt_votes?select=*'),
 db('rpc/vote_totals','POST',{}),db('messages?select=*&order=created_at.asc'),db('resources?select=*&order=created_at.desc'),db('rpc/my_doubt_ids','POST',{})]);
 if(epoch!==generation||profile?.id!==owner)return;
 const names=new Map(people.map(p=>[p.id,p.display_name]));const name=id=>names.get(id)||'Unknown user';
 const count=new Map(totals.map(t=>[t.kind+':'+t.item_id,Number(t.total)]));
 replaceRows(doubts,questions.map(q=>({id:localId(q.id),dbid:q.id,q:q.question,subject:q.subject,anon:q.anonymous,author:q.anonymous?'Anonymous':name(q.public_author_id),mine:own.includes(q.id),status:q.status,votes:count.get('doubt:'+q.id)||0,voted:ups.some(v=>v.doubt_id===q.id),replies:answers.filter(a=>a.doubt_id===q.id).map(a=>({author:name(a.author_id),text:a.body,time:timeLabel(a.created_at)}))})));
 replaceRows(notices,news.map(n=>({id:localId(n.id),title:n.title,text:n.body,pinned:n.pinned,author:name(n.author_id),time:timeLabel(n.created_at),category:'General',icon:'📢'})));
 replaceRows(polls,ps.map(p=>{const options=opts.filter(o=>o.poll_id===p.id);const selected=votes.find(v=>v.poll_id===p.id);const idx=options.findIndex(o=>o.id===selected?.option_id);return{id:localId(p.id),dbid:p.id,q:p.question,author:name(p.author_id),subject:'General',active:p.active,options:options.map(o=>o.label),optionIds:options.map(o=>o.id),votes:options.map(o=>count.get('poll:'+o.id)||0),myVote:idx<0?null:idx,owner:p.author_id===owner};}));
 const active=contacts[activeContact]?.dbid;
 replaceRows(contacts,people.filter(p=>p.id!==owner).map(p=>({dbid:p.id,name:p.display_name,initials:p.display_name.slice(0,2).toUpperCase(),color:'linear-gradient(135deg,#6c63ff,#a78bfa)',online:false,msgs:ms.filter(m=>m.sender_id===p.id||m.recipient_id===p.id).map(m=>({mine:m.sender_id===owner,text:m.body,time:timeLabel(m.created_at)}))})));
 activeContact=Math.max(0,contacts.findIndex(c=>c.dbid===active));
 replaceRows(resources,rs.map(r=>({name:r.title,url:r.url,subject:r.subject,type:'Link',size:'',icon:'📄',tag:'tag-blue'})));
 const stats=document.querySelectorAll('#page-dashboard .stat-num');[doubts.length,doubts.filter(d=>d.status==='answered').length,notices.length,polls.filter(p=>p.active).length].forEach((v,i)=>{if(stats[i])stats[i].textContent=v;});
 el('postNoticeBtn').style.display=isTeacher?'':'none';el('createPollBtn').style.display=isTeacher?'':'none';
 el('addResourceBtn').hidden=!isTeacher;
 el('recentLive').textContent=questions.length?questions[0].question:'No doubts yet.';
 renderDoubts();renderNotices();renderPolls();renderDM();renderResources();
}
const pick=(rows,id)=>{const row=rows.find(r=>r.id===id);if(!row)throw new Error('Item not found');return row;};
async function writeAndReload(path,method,body){await db(path,method,body);await loadAll();}
Object.assign(window,{
 toggleRole:signOut,
 submitDoubt:()=>run(async()=>{const question=values('doubtQuestion');if(!question)return;await writeAndReload('doubts','POST',{author_id:profile.id,question,subject:values('doubtSubject'),anonymous:el('doubtAnon').checked});el('doubtQuestion').value='';el('doubtAnon').checked=false;closeModal('modalDoubt');}),
 submitReply:id=>run(async()=>{const input=el('replyInput-'+id),body=input.value.trim();if(!body)return;await writeAndReload('replies','POST',{doubt_id:pick(doubts,id).dbid,author_id:profile.id,body});}),
 markAnswered:id=>run(async()=>{if(!isTeacher)throw new Error('Faculty only');await writeAndReload('doubts?id=eq.'+pick(doubts,id).dbid,'PATCH',{status:'answered'});}),
 vote:id=>run(async()=>{const d=pick(doubts,id);if(d.voted)await writeAndReload('doubt_votes?doubt_id=eq.'+d.dbid+'&voter_id=eq.'+profile.id,'DELETE');else await writeAndReload('doubt_votes','POST',{doubt_id:d.dbid,voter_id:profile.id});}),
 submitNotice:()=>run(async()=>{if(!isTeacher)throw new Error('Faculty only');const title=values('noticeTitle'),body=values('noticeText');if(!title||!body)return;await writeAndReload('notices','POST',{author_id:profile.id,title,body,pinned:el('noticePinned').checked});el('noticeTitle').value='';el('noticeText').value='';closeModal('modalNotice');}),
 submitPoll:()=>run(async()=>{if(!isTeacher)throw new Error('Faculty only');const question_text=values('pollQuestion'),choices=values('pollOptions').split(',').map(s=>s.trim()).filter(Boolean);if(!question_text||choices.length<2)throw new Error('Enter question and at least two choices');await writeAndReload('rpc/create_poll','POST',{question_text,choices});el('pollQuestion').value='';el('pollOptions').value='';closeModal('modalPoll');}),
 votePoll:(id,i)=>run(async()=>{const p=pick(polls,id);if(!p.active||p.myVote!==null)return;await writeAndReload('poll_votes','POST',{poll_id:p.dbid,option_id:p.optionIds[i],voter_id:profile.id});}),
 sendDM:()=>run(async()=>{const body=values('dmInput'),recipient=contacts[activeContact];if(!body||!recipient)return;await writeAndReload('messages','POST',{sender_id:profile.id,recipient_id:recipient.dbid,body});el('dmInput').value='';}),
 filterContacts:q=>{const term=q.toLowerCase();[...el('dmContacts').children].forEach((item,i)=>item.hidden=!contacts[i]?.name.toLowerCase().includes(term));},
 selectContact:i=>{if(!contacts[i])return;activeContact=i;renderDM();},
 renderMessages:()=>{const c=contacts[activeContact];el('dmChatHeader').textContent=c?c.name:'No contacts yet';el('dmMessages').replaceChildren();for(const m of c?.msgs||[]){const div=document.createElement('div');div.className='msg '+(m.mine?'mine':'theirs');const bubble=document.createElement('div');bubble.className='msg-bubble';bubble.textContent=m.text;const time=document.createElement('div');time.className='msg-time';time.textContent=m.time;div.append(bubble,time);el('dmMessages').append(div);}el('dmInput').disabled=!c;el('dmMessages').scrollTop=el('dmMessages').scrollHeight;},
 renderResources:()=>{el('resourcesGrid').replaceChildren();for(const r of resources){let url;try{url=new URL(r.url);}catch{continue;}if(url.protocol!=='https:')continue;const a=document.createElement('a');a.className='resource-card';a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='📄 '+r.name+' · '+r.subject;el('resourcesGrid').append(a);}},
 sendAI:()=>{const text=values('aiInput');if(!text)return;el('aiInput').value='';const messagesEl=el('aiMessages');for(const [role,content] of [['user',text],['bot','AI provider is not configured. Search the doubts or resource library for academic help.']]){const div=document.createElement('div');div.className='ai-msg '+role;const bubble=document.createElement('div');bubble.className='ai-bubble';bubble.textContent=content;div.append(bubble);messagesEl.append(div);}},
});
el('authForm').addEventListener('submit',e=>{e.preventDefault();authenticate(false);});
el('signUpBtn').addEventListener('click',()=>authenticate(true));
el('refreshBtn').addEventListener('click',()=>run(loadAll));
el('addResourceBtn').addEventListener('click',()=>run(async()=>{if(!isTeacher)throw new Error('Faculty only');const title=prompt('Resource title'),url=prompt('HTTPS resource URL'),subject=prompt('Subject');if(!title||!url||!subject)return;if(new URL(url).protocol!=='https:')throw new Error('HTTPS links only');await writeAndReload('resources','POST',{author_id:profile.id,title,url,subject});}));
resetSession();

// Near-real-time polling; never overwrite an open form or an in-progress mutation.
setInterval(async()=>{if(!profile||busy||currentPage!=='dm'||document.hidden)return;busy=true;try{await loadAll();}catch(e){notify(e.message);}finally{busy=false;}},15000);
