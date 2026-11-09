import Std

/- A finite access gate, not a proof of the JavaScript runtime or isolation. -/
namespace SumiAgent

structure Conditions where
  fresh : Bool
  approved : Bool
  allowed : Bool
  target : Bool
  supported : Bool
  deriving Repr

def canExecute (c : Conditions) : Bool :=
  c.fresh && c.approved && c.allowed && c.target && c.supported

theorem execute_requires_fresh (c : Conditions) (h : canExecute c = true) : c.fresh = true := by
  cases c with
  | mk fresh approved allowed target supported =>
    cases fresh <;> simp_all [canExecute]

theorem execute_requires_approval (c : Conditions) (h : canExecute c = true) : c.approved = true := by
  cases c with
  | mk fresh approved allowed target supported =>
    cases approved <;> simp_all [canExecute]

theorem execute_requires_policy (c : Conditions) (h : canExecute c = true) : c.allowed = true := by
  cases c with
  | mk fresh approved allowed target supported =>
    cases allowed <;> simp_all [canExecute]

theorem execute_requires_target (c : Conditions) (h : canExecute c = true) : c.target = true := by
  cases c with
  | mk fresh approved allowed target supported =>
    cases target <;> simp_all [canExecute]

theorem execute_requires_supported (c : Conditions) (h : canExecute c = true) : c.supported = true := by
  cases c with
  | mk fresh approved allowed target supported =>
    cases supported <;> simp_all [canExecute]

end SumiAgent

#print axioms SumiAgent.execute_requires_fresh
#print axioms SumiAgent.execute_requires_approval
#print axioms SumiAgent.execute_requires_policy
#print axioms SumiAgent.execute_requires_target
#print axioms SumiAgent.execute_requires_supported

def main : IO Unit := do
  let mut bits := ""
  for flags in [:32] do
    let c := SumiAgent.Conditions.mk
      (flags % 2 == 1) ((flags / 2) % 2 == 1) ((flags / 4) % 2 == 1)
      ((flags / 8) % 2 == 1) ((flags / 16) % 2 == 1)
    bits := bits ++ if SumiAgent.canExecute c then "1" else "0"
  IO.println s!"SUMI_AGENT_GATE={bits}"
