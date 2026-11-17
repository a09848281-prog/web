/**
 * Remote Camera GAS API v3.0
 * Bound to a dedicated Google Spreadsheet. Run setupDatabase() once in Apps Script.
 */
const TABLES={
 Users:["userId","salt","passwordHash","createdAt","lastLoginAt","failedCount","lockedUntil","status"],
 Devices:["deviceId","ownerUserId","deviceName","deviceSecretHash","codeHash","codeExpiresAt","createdAt","registeredAt","lastSeen","status"],
 Sessions:["tokenHash","userId","createdAt","expiresAt","revoked"],
 Commands:["commandId","deviceId","ownerUserId","command","payloadJson","createdAt","expiresAt","status"],
 Signals:["seq","sessionId","deviceId","sender","recipient","kind","sdp","candidateJson","createdAt","expiresAt"],
 Settings:["deviceId","settingsJson","updatedAt"],
 LocationHistory:["locationId","userId","deviceId","lat","lng","accuracy","timestamp","mode"],
 SecurityLog:["timestamp","userId","deviceId","eventType","success","detail"]
};
const SESSION_DAYS=7,CODE_MINUTES=10,COMMAND_MINUTES=3,SIGNAL_MINUTES=3,PBKDF2_ROUNDS=80000;

function doGet(){return ContentService.createTextOutput(JSON.stringify({ok:true,service:"Remote Camera API",version:"3.0.0"})).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){
 let req={};
 try{
  const raw=e&&e.parameter?e.parameter.payload:"";if(!raw)throw Error("payload がありません。");
  req=JSON.parse(raw);const result=dispatch_(req);
  if(e.parameter.mode==="json")return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  return bridge_(req.requestId||"",result);
 }catch(err){
  const result={ok:false,error:safeError_(err)};
  if(e&&e.parameter&&e.parameter.mode==="json")return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  return bridge_(req.requestId||"",result);
 }
}
function bridge_(id,result){
 const json=JSON.stringify({channel:"remote-camera-gas",requestId:id,result:result}).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
 return HtmlService.createHtmlOutput("<!doctype html><meta charset='utf-8'><script>parent.postMessage("+json+",'*');</script><p>処理が完了しました。</p>").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function dispatch_(r){
 switch(String(r.action||"")){
  case "health":return {ok:true,version:"3.0.0"};
  case "register":return register_(r);
  case "login":return login_(r);
  case "logout":return logout_(r);
  case "me":return me_(r);
  case "device_begin":return deviceBegin_(r);
  case "device_refresh_code":return refreshDeviceCode_(r);
  case "claim_device":return claimDevice_(r);
  case "list_devices":return listDevices_(r);
  case "device_poll":return devicePoll_(r);
  case "send_signal":return sendSignal_(r);
  case "poll_signals":return pollSignals_(r);
  case "send_command":return sendCommand_(r);
  case "get_settings":return getSettings_(r);
  case "save_settings":return saveSettings_(r);
  case "add_location":return addLocation_(r);
  case "get_locations":return getLocations_(r);
  case "delete_locations":return deleteLocations_(r);
  default:throw Error("未対応のAPIです: "+r.action);
 }
}
function setupDatabase(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw Error("対象スプレッドシートから「拡張機能 → Apps Script」で作成してください。");
 Object.keys(TABLES).forEach(name=>{
  let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);
  const headers=TABLES[name],last=Math.max(1,sh.getLastColumn()),current=sh.getRange(1,1,1,Math.max(last,headers.length)).getValues()[0];
  if(current.slice(0,headers.length).join("|")!==headers.join("|")){if(sh.getLastRow()>0)sh.clear();sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);}
 });
 return "Database ready";
}
function db_(){const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw Error("GASをスプレッドシートに紐付けてください。");return ss;}
function sheet_(n){const sh=db_().getSheetByName(n);if(!sh)throw Error("シートがありません。setupDatabase()を実行してください: "+n);return sh;}
function rows_(n){const sh=sheet_(n),last=sh.getLastRow();return last<2?[]:sh.getRange(2,1,last-1,TABLES[n].length).getValues();}
function find_(n,col,value){const data=rows_(n);for(let i=0;i<data.length;i++)if(String(data[i][col])===String(value))return {row:i+2,v:data[i]};return null;}
function append_(n,v){const sh=sheet_(n);sh.appendRow(v);return sh.getLastRow();}
function now_(){return new Date();}
function iso_(v){return v instanceof Date?v.toISOString():v?new Date(v).toISOString():"";}
function randomToken_(){return Utilities.getUuid().replace(/-/g,"")+Utilities.getUuid().replace(/-/g,"");}
function hash_(s){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8));}
function bytes_(s){return Utilities.newBlob(String(s)).getBytes();}
function xorBytes_(a,b){const out=[];for(let i=0;i<a.length;i++){let x=(a[i]&255)^(b[i]&255);out.push(x>127?x-256:x);}return out;}
function pbkdf2_(password,salt){
 const key=bytes_(password),base=bytes_(salt).concat([0,0,0,1]);
 let u=Utilities.computeHmacSha256Signature(base,key),out=u.slice();
 for(let i=1;i<PBKDF2_ROUNDS;i++){u=Utilities.computeHmacSha256Signature(u,key);out=xorBytes_(out,u);}
 return Utilities.base64EncodeWebSafe(out);
}
function authUser_(token){
 if(!token||typeof token!=="string")throw Error("ログインしてください。");
 const s=find_("Sessions",0,hash_(token));
 if(!s||s.v[4]===true||new Date(s.v[3]).getTime()<Date.now())throw Error("ログイン期限が切れました。再ログインしてください。");
 const u=find_("Users",0,s.v[1]);if(!u||u.v[7]!=="active")throw Error("アカウントが無効です。");
 return {userId:s.v[1],sessionRow:s.row};
}
function authDevice_(id,secret){
 const d=find_("Devices",0,id);
 if(!d||!d.v[1]||d.v[9]!=="active"||hash_(secret)!==d.v[3])throw Error("端末認証に失敗しました。");
 return {deviceId:id,userId:d.v[1],row:d.row,v:d.v};
}
function ownDevice_(userId,id){const d=find_("Devices",0,id);if(!d||d.v[1]!==userId||d.v[9]!=="active")throw Error("この端末を操作する権限がありません。");return d;}
function log_(u,id,event,ok,detail){append_("SecurityLog",[now_(),u||"",id||"",event,!!ok,String(detail||"").slice(0,240)]);}
function safeError_(e){return String(e&&e.message?e.message:e).slice(0,300);}
function makeSession_(userId){const token=randomToken_(),created=now_(),expiry=new Date(created.getTime()+SESSION_DAYS*86400000);append_("Sessions",[hash_(token),userId,created,expiry,false]);return {token,expiresAt:expiry.toISOString()};}

function register_(r){
 const id=String(r.userId||"").trim(),pw=String(r.password||"");
 if(!/^[A-Za-z0-9._-]{4,32}$/.test(id))throw Error("ユーザーIDは英数字・._-の4～32文字です。");
 if(pw.length<8||pw.length>128)throw Error("パスワードは8～128文字です。");
 const salt=randomToken_(),pwh=pbkdf2_(pw,salt),lock=LockService.getScriptLock();lock.waitLock(10000);
 try{if(find_("Users",0,id))throw Error("このユーザーIDは既に使われています。");append_("Users",[id,salt,pwh,now_(),"",0,"","active"]);}finally{lock.releaseLock();}
 const session=makeSession_(id);log_(id,"","register",true,"account created");return {ok:true,userId:id,token:session.token,expiresAt:session.expiresAt};
}
function login_(r){
 const id=String(r.userId||"").trim(),pw=String(r.password||""),u=find_("Users",0,id);
 if(!u||u.v[7]!=="active"){log_(id,"","login",false,"unknown account");throw Error("ユーザーIDまたはパスワードが違います。");}
 if(u.v[6]&&new Date(u.v[6]).getTime()>Date.now())throw Error("ログインを一時的に制限しています。時間をおいてください。");
 const valid=pbkdf2_(pw,String(u.v[1]))===String(u.v[2]),sh=sheet_("Users");
 if(!valid){const n=Number(u.v[5]||0)+1;sh.getRange(u.row,6).setValue(n);if(n>=8)sh.getRange(u.row,7).setValue(new Date(Date.now()+15*60000));log_(id,"","login",false,"wrong password");throw Error("ユーザーIDまたはパスワードが違います。");}
 sh.getRange(u.row,5).setValue(now_());sh.getRange(u.row,6,1,2).setValues([[0,""]]);
 const session=makeSession_(id);log_(id,"","login",true,"success");return {ok:true,userId:id,token:session.token,expiresAt:session.expiresAt};
}
function logout_(r){const u=authUser_(r.token);sheet_("Sessions").getRange(u.sessionRow,5).setValue(true);log_(u.userId,"","logout",true,"success");return {ok:true};}
function me_(r){const u=authUser_(r.token);return {ok:true,userId:u.userId};}
function newCode_(){return String(Math.floor(10000000+Math.random()*90000000));}
function deviceBegin_(r){
 const id=String(r.deviceId||Utilities.getUuid()),secret=randomToken_(),code=newCode_(),expiry=new Date(Date.now()+CODE_MINUTES*60000),name=String(r.deviceName||"Android端末").slice(0,40),lock=LockService.getScriptLock();lock.waitLock(10000);
 try{if(find_("Devices",0,id))throw Error("端末IDが重複しています。");append_("Devices",[id,"",name,hash_(secret),hash_(code),expiry,now_(),"","","pending"]);}finally{lock.releaseLock();}
 return {ok:true,deviceId:id,deviceSecret:secret,registrationCode:code,expiresAt:expiry.toISOString()};
}
function refreshDeviceCode_(r){
 const id=String(r.deviceId||""),d=find_("Devices",0,id);
 if(!d||d.v[9]!=="pending"||hash_(String(r.deviceSecret||""))!==d.v[3])throw Error("登録コードを更新できません。");
 const code=newCode_(),expiry=new Date(Date.now()+CODE_MINUTES*60000);sheet_("Devices").getRange(d.row,5,1,2).setValues([[hash_(code),expiry]]);return {ok:true,registrationCode:code,expiresAt:expiry.toISOString()};
}
function claimDevice_(r){
 const u=authUser_(r.token),code=String(r.code||"").trim();if(!/^\d{8}$/.test(code))throw Error("登録コードは8桁です。");
 const a=rows_("Devices");let hit=null;
 for(let i=0;i<a.length;i++)if(!a[i][1]&&a[i][4]===hash_(code)&&new Date(a[i][5]).getTime()>Date.now()&&a[i][9]==="pending"){hit={row:i+2,v:a[i]};break;}
 if(!hit)throw Error("登録コードが無効または期限切れです。Android側で再表示してください。");
 const name=String(r.deviceName||hit.v[2]||"Android端末").slice(0,40),sh=sheet_("Devices");
 sh.getRange(hit.row,2).setValue(u.userId);sh.getRange(hit.row,3).setValue(name);sh.getRange(hit.row,5,1,6).setValues([["","",hit.v[6],now_(),"","active"]]);
 log_(u.userId,hit.v[0],"device_claim",true,"paired");return {ok:true,deviceId:hit.v[0],deviceName:name};
}
function listDevices_(r){
 const u=authUser_(r.token),out=[];
 rows_("Devices").forEach(v=>{if(v[1]===u.userId&&v[9]==="active"){const t=v[8]?new Date(v[8]).getTime():0;out.push({deviceId:v[0],deviceName:v[2],createdAt:iso_(v[6]),registeredAt:iso_(v[7]),lastSeen:iso_(v[8]),online:t>0&&Date.now()-t<90000});}});
 return {ok:true,devices:out};
}
function devicePoll_(r){
 const id=String(r.deviceId||""),secret=String(r.deviceSecret||""),d=find_("Devices",0,id);
 if(!d||hash_(secret)!==d.v[3])throw Error("端末認証に失敗しました。");
 if(d.v[9]==="pending")return {ok:true,registered:false,commands:[],signals:[],latestSeq:Number(r.afterSeq||0)};
 if(d.v[9]!=="active"||!d.v[1])throw Error("端末は無効です。");
 sheet_("Devices").getRange(d.row,9).setValue(now_());
 const cmds=rows_("Commands"),commands=[];
 for(let i=0;i<cmds.length;i++){const v=cmds[i];if(v[1]===id&&v[7]==="pending"){if(new Date(v[6]).getTime()<Date.now()){sheet_("Commands").getRange(i+2,8).setValue("expired");continue;}commands.push({commandId:v[0],command:v[3],payload:JSON.parse(v[4]||"{}")});sheet_("Commands").getRange(i+2,8).setValue("delivered");}}
 const after=Number(r.afterSeq||0),all=rows_("Signals"),signals=[];
 for(let i=0;i<all.length;i++){const v=all[i],seq=Number(v[0]||i+2);if(v[2]===id&&v[4]==="device"&&seq>after&&new Date(v[9]).getTime()>Date.now())signals.push({seq,sessionId:v[1],kind:v[5],sdp:v[6],candidate:v[7]?JSON.parse(v[7]):null});}
 const settingsHit=find_("Settings",0,id);let settings={quality:"720",dataMode:"standard",connectedLocationEnabled:false,idleLocationEnabled:false,connectedInterval:30,idleInterval:300};
 if(settingsHit)try{settings=Object.assign(settings,JSON.parse(settingsHit.v[1]||"{}"));}catch(e){}
 return {ok:true,registered:true,commands,signals,latestSeq:signals.reduce((m,s)=>Math.max(m,s.seq),after),settings};
}
function sendSignal_(r){
 const id=String(r.deviceId||""),recipient=String(r.recipient||"");if(!["device","viewer"].includes(recipient))throw Error("recipientが不正です。");
 if(r.deviceSecret)authDevice_(id,String(r.deviceSecret));else{const u=authUser_(r.token);ownDevice_(u.userId,id);}
 const session=String(r.sessionId||""),kind=String(r.kind||"");
 if(!/^[A-Za-z0-9._:-]{8,100}$/.test(session))throw Error("sessionIdが不正です。");
 if(!["offer","answer","candidate","error","bye"].includes(kind))throw Error("signal kindが不正です。");
 const sdp=String(r.sdp||"").slice(0,200000),candidate=r.candidate?JSON.stringify(r.candidate).slice(0,10000):"",seq=append_("Signals",[0,session,id,r.deviceSecret?"device":"viewer",recipient,kind,sdp,candidate,now_(),new Date(Date.now()+SIGNAL_MINUTES*60000)]);
 sheet_("Signals").getRange(seq,1).setValue(seq);return {ok:true,seq};
}
function pollSignals_(r){
 const u=authUser_(r.token),id=String(r.deviceId||"");ownDevice_(u.userId,id);const session=String(r.sessionId||""),after=Number(r.afterSeq||0),a=rows_("Signals"),signals=[];
 for(let i=0;i<a.length;i++){const v=a[i],seq=Number(v[0]||i+2);if(v[1]===session&&v[2]===id&&v[4]==="viewer"&&seq>after&&new Date(v[9]).getTime()>Date.now())signals.push({seq,kind:v[5],sdp:v[6],candidate:v[7]?JSON.parse(v[7]):null});}
 return {ok:true,signals};
}
function sendCommand_(r){
 const u=authUser_(r.token),id=String(r.deviceId||"");ownDevice_(u.userId,id);const cmd=String(r.command||""),allowed=["location_once","location_settings","camera","volume","quality","data_mode","disconnect"];
 if(!allowed.includes(cmd))throw Error("許可されていない命令です。");
 const commandId=Utilities.getUuid();append_("Commands",[commandId,id,u.userId,cmd,JSON.stringify(r.payload||{}).slice(0,5000),now_(),new Date(Date.now()+COMMAND_MINUTES*60000),"pending"]);return {ok:true,commandId};
}
function clamp_(v,min,max,def){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):def;}
function getSettings_(r){
 const u=authUser_(r.token),d=ownDevice_(u.userId,String(r.deviceId||"")),h=find_("Settings",0,d.v[0]);
 let settings={quality:"720",dataMode:"standard",connectedLocationEnabled:false,idleLocationEnabled:false,connectedInterval:30,idleInterval:300};
 if(h)try{settings=Object.assign(settings,JSON.parse(h.v[1]||"{}"));}catch(e){}
 return {ok:true,settings};
}
function saveSettings_(r){
 const u=authUser_(r.token),d=ownDevice_(u.userId,String(r.deviceId||"")),s=r.settings||{};
 const clean={quality:["auto","360","480","720","1080"].includes(String(s.quality))?String(s.quality):"720",dataMode:["auto","ultra","save","standard","high"].includes(String(s.dataMode))?String(s.dataMode):"standard",
 connectedLocationEnabled:s.connectedLocationEnabled===true,idleLocationEnabled:s.idleLocationEnabled===true,connectedInterval:clamp_(s.connectedInterval,10,3600,30),idleInterval:clamp_(s.idleInterval,10,3600,300)};
 const hit=find_("Settings",0,d.v[0]),sh=sheet_("Settings"),json=JSON.stringify(clean);
 if(hit)sh.getRange(hit.row,2,1,2).setValues([[json,now_()]]);else append_("Settings",[d.v[0],json,now_()]);
 return {ok:true,settings:clean};
}
function addLocation_(r){
 const d=authDevice_(String(r.deviceId||""),String(r.deviceSecret||"")),lat=Number(r.lat),lng=Number(r.lng),accuracy=Number(r.accuracy||0);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)throw Error("位置情報が不正です。");
 const mode=["manual","connected","background"].includes(String(r.mode))?String(r.mode):"manual",timestamp=r.timestamp?new Date(Number(r.timestamp)):now_();
 if(isNaN(timestamp.getTime())||timestamp.getTime()>Date.now()+60000)throw Error("取得日時が不正です。");
 append_("LocationHistory",[Utilities.getUuid(),d.userId,d.deviceId,lat,lng,Math.max(0,accuracy),timestamp,mode]);return {ok:true};
}
function getLocations_(r){
 const u=authUser_(r.token),id=String(r.deviceId||"");ownDevice_(u.userId,id);const limit=clamp_(r.limit,1,1000,500),a=rows_("LocationHistory"),locations=[];
 for(let i=a.length-1;i>=0&&locations.length<limit;i--){const v=a[i];if(v[1]===u.userId&&v[2]===id)locations.push({id:v[0],lat:v[3],lng:v[4],accuracy:v[5],timestamp:iso_(v[6]),mode:v[7]});}
 return {ok:true,locations:locations.reverse()};
}
function deleteLocations_(r){
 const u=authUser_(r.token),id=String(r.deviceId||"");ownDevice_(u.userId,id);const sh=sheet_("LocationHistory"),a=rows_("LocationHistory");let deleted=0;
 for(let i=a.length-1;i>=0;i--){const v=a[i];if(v[1]===u.userId&&v[2]===id&&(r.all===true||!r.before||new Date(v[6]).getTime()<=new Date(r.before).getTime())){sh.deleteRow(i+2);deleted++;}}
 log_(u.userId,id,"location_delete",true,String(deleted));return {ok:true,deleted};
}