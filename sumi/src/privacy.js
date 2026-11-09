// 原文の文字位置を維持し、置換は利用者が選んだルールから決定する。
export const MAX_TEXT = 50000;
export const LABELS = { PERSON: '氏名', ADDRESS: '居住地', AGE: '年齢', SCHOOL: '学校', CLASS: 'クラス', ROLE: '役職', CLUB: '部活動', EMAIL: 'メール', PHONE: '電話番号', CARD: 'カード番号', CUSTOM: '指定した言葉', COMMUTE: '通学時間' };
export const PRESETS = {
  teacher: { label: '校内・教員', location: 'city', age: 'exact', school: 'type', grade: 'grade', role: 'general', club: 'general', keepCommute: true },
  students: { label: '生徒と共有', location: 'prefecture', age: 'decade', school: 'type', grade: 'grade', role: 'hide', club: 'general', keepCommute: true },
  public: { label: '校外に発表', location: 'region', age: 'decade', school: 'hide', grade: 'hide', role: 'hide', club: 'hide', keepCommute: true }
};
export const SAMPLE = `氏名：山田太郎、クラス：2年3組、学校：愛知県立さくら高校、居住地：愛知県豊田市、年齢：16歳、部活動：吹奏楽部、役職：部長、通学：90分、交通手段：電車。朝の混雑と乗り換えが大変です。
氏名：佐藤花子、クラス：2年1組、学校：愛知県立さくら高校、居住地：愛知県名古屋市、年齢：17歳、部活動：美術部、通学：45分、交通手段：電車。混雑する時間を避けたいです。
氏名：鈴木健太、クラス：1年2組、学校：愛知県立さくら高校、居住地：愛知県岡崎市、年齢：15歳、部活動：サッカー部、通学：70分、交通手段：バス。バスの待ち時間が長いです。
氏名：高橋美咲、クラス：1年1組、学校：愛知県立さくら高校、居住地：愛知県刈谷市、年齢：16歳、部活動：科学部、通学：35分、交通手段：自転車。雨の日は通学が大変です。
氏名：田中陽、クラス：3年2組、学校：愛知県立さくら高校、居住地：愛知県安城市、年齢：18歳、役職：生徒会長、通学：50分、交通手段：バス。もう少し遅い時間に登校したいです。
氏名：伊藤葵、クラス：2年2組、学校：愛知県立さくら高校、居住地：愛知県一宮市、年齢：17歳、通学：65分、交通手段：電車。乗り換えの接続をよくしてほしいです。`;

const regions = {
  北海道: ['北海道'], 東北: ['青森県','岩手県','宮城県','秋田県','山形県','福島県'], 関東: ['茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県'], 中部: ['新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県'], 近畿: ['三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県'], 中国: ['鳥取県','島根県','岡山県','広島県','山口県'], 四国: ['徳島県','香川県','愛媛県','高知県'], '九州・沖縄': ['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']
};
const prefectures = Object.values(regions).flat();
const cities = Object.fromEntries([
  ...['名古屋','豊田','岡崎','刈谷','安城','一宮','豊橋','豊川','瀬戸','半田','常滑','東海','大府','知立','稲沢','犬山','小牧','春日井','西尾','碧南','豊明','長久手','日進','清須'].map(c => [c+'市','愛知県']),
  ['横浜市','神奈川県'],['川崎市','神奈川県'],['大阪市','大阪府'],['京都市','京都府'],['岐阜市','岐阜県'],['浜松市','静岡県'],['静岡市','静岡県'],['神戸市','兵庫県'],['札幌市','北海道'],['仙台市','宮城県'],['福岡市','福岡県'],['広島市','広島県']
]);
const escapeRE = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digits = s => Number(s.normalize('NFKC').match(/\d+/)?.[0]);
const priority = { CUSTOM: 100, CARD: 99, EMAIL: 98, PHONE: 97, PERSON: 95, SCHOOL: 90, ADDRESS: 80, CLASS: 75, AGE: 70, CLUB: 65, ROLE: 60, COMMUTE: 50 };
const safeKinds = new Set(Object.keys(LABELS));

export function records(text) {
  let offset = 0;
  return text.split('\n').map(line => {
    const row = { text: line, start: offset };
    offset += line.length + 1;
    return row;
  }).filter(r => r.text.trim()).map((r,i) => ({ ...r, id: `R${String(i+1).padStart(2,'0')}` }));
}

export function deduplicateEntities(candidates, text) {
  const accepted = [];
  const sorted=candidates.filter(e => safeKinds.has(e.kind) && Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.end <= text.length && e.end > e.start && e.value === text.slice(e.start,e.end))
    .sort((a,b)=>a.start-b.start||b.end-a.end);
  // Overlapping candidates form connected spans. If a user-specified secret
  // intersects another candidate, mask the union rather than leaving a suffix
  // or prefix of the automatically detected value visible.
  for(let i=0;i<sorted.length;){
    let j=i+1,end=sorted[i].end;
    while(j<sorted.length&&sorted[j].start<end){end=Math.max(end,sorted[j].end);j++;}
    const group=sorted.slice(i,j);
    if(group.some(e=>e.kind==='CUSTOM')){
      const start=group[0].start;
      accepted.push({kind:'CUSTOM',value:text.slice(start,end),start,end,source:'manual',id:`${start}:${end}:CUSTOM`});
    }else{
      const chosen=[];
      group.sort((a,b)=>priority[b.kind]-priority[a.kind]||(b.end-b.start)-(a.end-a.start)||a.start-b.start);
      for(const e of group)if(!chosen.some(a=>a.start<e.end&&e.start<a.end))chosen.push({...e,id:`${e.start}:${e.end}:${e.kind}`});
      accepted.push(...chosen);
    }
    i=j;
  }
  return accepted.sort((a,b) => a.start-b.start);
}

export function detect(text, policy, extras = [], ai = []) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('原文は50,000文字以内にしてください。');
  const found = [];
  const add = (kind, value, start, source = 'rule') => { if (value) found.push({kind,value,start,end:start+value.length,source}); };
  const scan = (re,kind,filter = () => true) => { for (const m of text.matchAll(re)) if (filter(m[0])) add(kind,m[0],m.index); };
  const labeled = (labels, kind, max = 40) => {
    const re = new RegExp(`(?:${labels})[\\s　]*[：:][\\s　]*([^、，,。；;\\n]{1,${max}})`, 'gu');
    for (const m of text.matchAll(re)) {
      const value = m[1].trim();
      add(kind,value,m.index + m[0].lastIndexOf(m[1]) + m[1].indexOf(value));
    }
  };
  scan(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/giu,'EMAIL');
  scan(/(?<![0-9０-９])[0０][0-9０-９]{1,3}[-‐‑–ー−－ 　]?[0-9０-９]{2,4}[-‐‑–ー−－ 　]?[0-9０-９]{3,4}(?![0-9０-９])/gu,'PHONE',v => [10,11].includes(v.replace(/[^0-9０-９]/g,'').length));
  scan(/(?<![0-9０-９])(?:[0-9０-９]{4}[- 　]){3}[0-9０-９]{4}(?![0-9０-９])/gu,'CARD');
  labeled('氏名|名前|回答者名|担当者|お名前','PERSON',24);
  labeled('メールアドレス|メール|EMAIL|email','EMAIL',90);
  scan(/(?:山田|佐藤|鈴木|高橋|田中|伊藤|渡辺|中村|小林|加藤|吉田|山本|松本|井上|木村|林|清水|斎藤|森|池田)[ 　]+[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{1,5}(?=さん|様|君|くん|ちゃん|[、，,。；;\n]|$)/gu,'PERSON');
  labeled('居住地|住所|居住地域|出身地','ADDRESS',55);
  const prefRE = prefectures.map(escapeRE).join('|');
  scan(new RegExp(`(?:${prefRE})(?:[\\p{Script=Han}ヶケぁ-んァ-ヶー]{1,10}市|[\\p{Script=Han}ヶケ]{1,8}区)?(?:[\\p{Script=Han}ヶケ]{1,8}(?:町|村))?(?:[0-9０-９一二三四五六七八九十丁目番地号ー−-]{1,22})?`,'gu'),'ADDRESS');
  scan(new RegExp(Object.keys(cities).sort((a,b)=>b.length-a.length).map(escapeRE).join('|'),'gu'),'ADDRESS');
  labeled('学校|学校名|所属校','SCHOOL',35);
  scan(/[\p{Script=Han}ぁ-んァ-ヶーA-ZＡ-Ｚ0-9０-９]{2,22}(?:高等学校|中学校|小学校|高校|高専|大学)/gu,'SCHOOL');
  scan(/(?:高校|中学|小学)?[1-6１-６]年(?:[1-9１-９][0-9０-９]?組|[A-ZＡ-Ｚ]組)/gu,'CLASS');
  labeled('クラス|学級','CLASS',15);
  scan(/[0-9０-９]{1,3}[ 　]*歳/gu,'AGE',v => digits(v)>0 && digits(v)<=120);
  scan(/生徒会副会長|生徒会長|生徒会役員|学級委員長|クラス委員長|副部長|部長|委員長|主将|キャプテン/gu,'ROLE');
  labeled('役職','ROLE',20);
  scan(/(?:吹奏楽|美術|演劇|科学|情報|軽音楽|音楽|合唱|茶道|華道|放送|写真|書道|文芸|陸上|野球|サッカー|バスケットボール|バレーボール|バレー|テニス|卓球|剣道|柔道|水泳|ダンス|ロボット|プログラミング)部/gu,'CLUB');
  labeled('部活動|所属部','CLUB',20);
  if (!policy.keepCommute) for (const m of text.matchAll(/通学(?:時間)?[：:はに約\s　]*([0-9０-９]{1,3}[ 　]*分)/gu)) add('COMMUTE',m[1],m.index+m[0].lastIndexOf(m[1]));
  for (const word of extras.slice(0,100).map(v=>String(v).trim()).filter(Boolean)) {
    if (word.length>100) continue;
    let offset=0,index;
    // A repeated secret can overlap itself (e.g. "aba" in "ababa").
    // Advance one UTF-16 code unit so the union of all occurrences is masked.
    while ((index=text.indexOf(word,offset))!==-1) { add('CUSTOM',word,index,'manual'); offset=index+1; }
  }
  found.push(...validateAIEntities(text,ai));
  return deduplicateEntities(found,text);
}

export function validateAIEntities(text, raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw.slice(0,100)) {
    if (!e || !safeKinds.has(e.kind) || typeof e.value !== 'string' || e.value.length<2 || e.value.length>80 || /\n/.test(e.value)) continue;
    if (e.kind==='AGE' && !/^[0-9０-９]{1,3}[ 　]*歳$/u.test(e.value)) continue;
    let from=0, at;
    while ((at=text.indexOf(e.value,from))!==-1) { out.push({kind:e.kind,value:e.value,start:at,end:at+e.value.length,source:'local-ai'}); from=at+e.value.length; }
  }
  return out;
}

function location(value, level) {
  if (level==='hide') return '居住地非公開';
  const pref = prefectures.find(p => value.includes(p)) || Object.entries(cities).find(([c])=>value.includes(c))?.[1];
  if (!pref) return '地域非公開';
  if (level==='prefecture') return pref;
  if (level==='region') return Object.entries(regions).find(([,ps])=>ps.includes(pref))[0] + (pref==='北海道' ? '' : '地方');
  const city = value.match(/(?:都|道|府|県)([\p{Script=Han}ヶケぁ-んァ-ヶー]{1,10}市|[\p{Script=Han}ヶケ]{1,8}区)/u)?.[1] || Object.keys(cities).find(c=>value.includes(c));
  return city ? pref+city : pref;
}

export function replacement(e, policy, aliases) {
  switch(e.kind) {
    case 'PERSON': return aliases.get(e.value);
    case 'ADDRESS': return location(e.value,policy.location);
    case 'AGE': return policy.age==='exact' ? e.value : policy.age==='hide' ? '年齢非公開' : `${Math.floor(digits(e.value)/10)*10}代`;
    case 'SCHOOL': return policy.school==='hide' ? '学校非公開' : /高等学校|高校/.test(e.value) ? '高校' : /中学校/.test(e.value) ? '中学校' : /小学校/.test(e.value) ? '小学校' : /大学/.test(e.value) ? '大学' : '学校';
    case 'CLASS': return policy.grade==='hide' ? 'クラス非公開' : e.value.normalize('NFKC').match(/(?:高校|中学|小学)?[1-6]年/u)?.[0] || '学級';
    case 'ROLE': return policy.role==='hide' ? '役職非公開' : '学校内の役職';
    case 'CLUB': return policy.club==='hide' ? '部活動非公開' : '部活動';
    case 'COMMUTE': return '非公開';
    case 'EMAIL': return '[メール非公開]';
    case 'PHONE': return '[電話番号非公開]';
    case 'CARD': return '[カード番号非公開]';
    default: return '[非公開]';
  }
}

export function transform(text, candidates, policy, overrides = {}) {
  const aliases=new Map();
  for (const e of candidates.filter(e=>e.kind==='PERSON')) if (!aliases.has(e.value)) aliases.set(e.value,`回答者${aliases.size<26 ? String.fromCharCode(65+aliases.size) : aliases.size+1}`);
  let cursor=0,result='';
  const edits=candidates.map(e=>{
    const choice=overrides[e.id] || 'auto';
    const to=choice==='keep' ? e.value : choice==='hide' ? '[非公開]' : replacement(e,policy,aliases);
    return {...e,to,choice,changed:to!==e.value,reason:reason(e,policy,choice)};
  });
  for (const e of edits) { result+=text.slice(cursor,e.start)+e.to; cursor=e.end; }
  result+=text.slice(cursor);
  const combinations=records(text).filter(r=>candidates.filter(e=>{
    const pos=r.start;
    return e.start>=pos && e.start<pos+r.text.length && ['CLASS','ROLE','CLUB','SCHOOL'].includes(e.kind);
  }).length>=2).map(r=>r.id);
  return {text:result,edits,combinations,changed:edits.filter(e=>e.changed).length,kept:edits.filter(e=>e.choice==='keep').length};
}

function reason(e,p,choice) {
  if (choice==='keep') return '利用者が原文のまま残す設定にしました。共有先に見せてよいか確認してください。';
  if (choice==='hide') return '利用者がこの箇所を非公開にしました。';
  const reasons={ PERSON:'同じ氏名は同じ回答者ラベルに置き換えます。', ADDRESS:({region:'居住地を地方単位まで粗くします。',prefecture:'居住地を都道府県単位まで粗くします。',city:'番地などを除き、市区町村までにします。',hide:'居住地を非公開にします。'})[p.location], AGE:p.age==='exact'?'選択した条件では、年齢をそのまま残します。':p.age==='decade'?'年齢を年代にまとめます。':'年齢を非公開にします。', SCHOOL:'特定の学校名を共有文に残さないようにします。', CLASS:'クラスの組番号は共有文に残さないようにします。', ROLE:'学校内の役職は、個人特定の手がかりになり得ます。', CLUB:'部活動とクラスなどの組合せを確認してください。', EMAIL:'メールアドレスを非公開にします。', PHONE:'電話番号を非公開にします。', CARD:'カード番号を非公開にします。', CUSTOM:'追加で指定した言葉を非公開にします。', COMMUTE:'研究で残す情報から通学時間を外しています。' };
  return reasons[e.kind];
}

export function aggregate(text) {
  const rows=records(text);
  const minutes=rows.flatMap(r=>{
    const m=r.text.match(/通学(?:時間)?[：:はに約\s　]*([0-9０-９]{1,3})[ 　]*分/u);
    return m ? [{id:r.id,value:digits(m[1])}] : [];
  });
  const transport=['電車','バス','自転車','徒歩'].map(name=>({name,ids:rows.filter(r=>new RegExp(`交通手段[：:]\\s*${name}(?![^。；;、，,\\n]*非公開)`).test(r.text)).map(r=>r.id)}));
  const themes=['混雑','乗り換え','待ち時間','雨','登校'].map(word=>({word,ids:rows.filter(r=>r.text.includes(word)).map(r=>r.id)})).filter(t=>t.ids.length);
  return {count:rows.length,minutes,mean:minutes.length?minutes.reduce((s,m)=>s+m.value,0)/minutes.length:null,max:minutes.length?Math.max(...minutes.map(m=>m.value)):null,transport,themes,rows};
}

export function parseCSV(content) {
  const rows=[];let row=[],cell='',quoted=false;
  content=content.replace(/^\uFEFF/,'');
  for(let i=0;i<content.length;i++) {
    const c=content[i];
    if(c==='"') { if(quoted && content[i+1]==='"') {cell+='"';i++;} else if(quoted || !cell) quoted=!quoted; else throw new Error('CSVの引用符を確認してください。'); }
    else if(c===',' && !quoted) {row.push(cell);cell='';}
    else if((c==='\n'||c==='\r') && !quoted) { if(c==='\r' && content[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''; }
    else cell+=c;
  }
  if(quoted) throw new Error('CSVの引用符が閉じていません。');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2) throw new Error('CSVには見出し行と1件以上の回答が必要です。');
  const headers=rows.shift().map(v=>v.trim());
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length) throw new Error('CSVの見出しは空欄・重複のない名前にしてください。');
  if(rows.some(r=>r.length!==headers.length)) throw new Error('CSVの列数が見出しと一致していません。');
  const aliases={'名前':'氏名','氏名':'氏名','住所':'居住地','学校名':'学校','通学時間':'通学','交通手段':'交通手段'};
  const text=rows.map(r=>r.map((v,i)=>`${aliases[headers[i]]||headers[i]}：${v.trim().replace(/\r?\n/g,' ／ ')}`).join('、')).join('\n');
  if(text.length>MAX_TEXT) throw new Error('読み込んだ文章が50,000文字を超えています。');
  return text;
}

export function validateEndpoint(raw) {
  let u;try {u=new URL(raw);}catch{throw new Error('OllamaのURLを確認してください。');}
  if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)) throw new Error('この端末のOllamaだけに接続できます。例：http://127.0.0.1:11434');
  return u.origin;
}

export function validatePolicy(p) {
  const allowed={location:['region','prefecture','city','hide'],age:['exact','decade','hide'],school:['type','hide'],grade:['grade','hide'],role:['general','hide'],club:['general','hide']};
  if(!p || typeof p!=='object')throw new Error('加工条件が不正です。');
  const out={label:typeof p.label==='string'?p.label.slice(0,40):'カスタム'};
  for(const [k,values] of Object.entries(allowed)){if(!values.includes(p[k]))throw new Error('加工条件が不正です。');out[k]=p[k];}
  if(typeof p.keepCommute!=='boolean')throw new Error('加工条件が不正です。');out.keepCommute=p.keepCommute;
  return out;
}

export function buildSharePayload(result,policy,createdAt=new Date().toISOString()) {
  if(!result||typeof result.text!=='string'||result.text.length>MAX_TEXT)throw new Error('共有用の文章を作成してください。');
  return {format:'sumi-share',version:1,createdAt,text:result.text,records:records(result.text).map(({id,text})=>({id,text})),policy:validatePolicy(policy),review:{confirmed:true,manuallyKept:result.kept}};
}
