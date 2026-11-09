import { lstat } from 'node:fs/promises';

// A narrow observation of the selected path, not an effective-access check.
// Parent directories, ACLs, mounts and privileged processes are not assessed.
export async function inspectStoragePath(path){
  if(typeof path!=='string'||!path.trim()||path.includes('\0'))throw new Error('点検する保存先を指定してください。');
  if(process.platform==='win32'||typeof process.getuid!=='function')throw new Error('この点検はPOSIXアクセス権を持つ環境でのみ利用できます。');
  const stat=await lstat(path);
  if(stat.isSymbolicLink())throw new Error('シンボリックリンクは点検できません。実際の保存先を指定してください。');
  if(!stat.isDirectory()&&!stat.isFile())throw new Error('通常のファイルまたはフォルダーを指定してください。');
  const permissions=stat.mode&0o777;
  const ownedByCurrentUser=stat.uid===process.getuid();
  const accessibleToOthers=(permissions&0o077)!==0;
  return {
    format:'sumi-storage-observation',version:1,
    objectType:stat.isDirectory()?'directory':'file',
    permissions:permissions.toString(8).padStart(3,'0'),
    ownedByCurrentUser,accessibleToOthers,
    result:ownedByCurrentUser&&!accessibleToOthers?'basic-mode-ok':'review-needed',
    limitations:['ACLや拡張属性を確認していない','親フォルダーやファイル内部を確認していない','管理者・同一ユーザーの別プロセスのアクセスは防げない','点検後の変更やネットワークストレージの実効権限は確認していない']
  };
}
