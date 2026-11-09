// Closed gate used before the agent receives a document. Only literal true
// satisfies a condition; callers must derive the conditions from trusted state.
export function canExecuteAgent(c){
  return c?.fresh===true&&c.approved===true&&c.allowed===true&&c.target===true&&c.supported===true;
}
