import Std

/- A finite model of one verifier session. It assumes that a success event
   means the external signature and ciphertext checks succeeded. It does not
   prove those checks, JavaScript runtime behavior, or cross-process replay. -/
namespace SumiVerifier

inductive State where | ready | verifying | consumed | cancelled
  deriving Repr, DecidableEq
inductive Event where | begin | success | failure | cancel
  deriving Repr, DecidableEq

def step : State → Event → State × Bool
  | .ready, .begin => (.verifying, false)
  | .verifying, .success => (.consumed, true)
  | .verifying, .failure => (.ready, false)
  | .ready, .cancel => (.cancelled, false)
  | .verifying, .cancel => (.cancelled, false)
  | s, _ => (s, false)

theorem acceptance_requires_verifying (s : State) (e : Event)
    (h : (step s e).2 = true) : s = .verifying ∧ e = .success := by
  cases s <;> cases e <;> simp_all [step]

theorem begin_reserves : step .ready .begin = (.verifying, false) := by rfl
theorem failure_allows_retry : step .verifying .failure = (.ready, false) := by rfl
theorem success_consumes : step .verifying .success = (.consumed, true) := by rfl
theorem cancel_blocks_success : (step (step .verifying .cancel).1 .success).2 = false := by rfl

def emissions (s : State) : List Event → Nat
  | [] => 0
  | e :: es => (if (step s e).2 then 1 else 0) + emissions (step s e).1 es

theorem consumed_never_accepts (events : List Event) : emissions .consumed events = 0 := by
  induction events with
  | nil => rfl
  | cons event rest ih => cases event <;> simp [emissions, step, ih]

theorem cancelled_never_accepts (events : List Event) : emissions .cancelled events = 0 := by
  induction events with
  | nil => rfl
  | cons event rest ih => cases event <;> simp [emissions, step, ih]

theorem at_most_one_acceptance (s : State) (events : List Event) : emissions s events ≤ 1 := by
  induction events generalizing s with
  | nil => simp [emissions]
  | cons event rest ih => cases s <;> cases event <;> simp [emissions, step, consumed_never_accepts, ih]

def stateCode : State → Nat
  | .ready => 0 | .verifying => 1 | .consumed => 2 | .cancelled => 3

end SumiVerifier

#print axioms SumiVerifier.acceptance_requires_verifying
#print axioms SumiVerifier.begin_reserves
#print axioms SumiVerifier.failure_allows_retry
#print axioms SumiVerifier.success_consumes
#print axioms SumiVerifier.cancel_blocks_success
#print axioms SumiVerifier.consumed_never_accepts
#print axioms SumiVerifier.cancelled_never_accepts
#print axioms SumiVerifier.at_most_one_acceptance

def main : IO Unit := do
  let states := [SumiVerifier.State.ready, .verifying, .consumed, .cancelled]
  let events := [SumiVerifier.Event.begin, .success, .failure, .cancel]
  let mut result := ""
  for s in states do
    for e in events do
      let transition := SumiVerifier.step s e
      let code := 2 * SumiVerifier.stateCode transition.1 + if transition.2 then 1 else 0
      result := result ++ toString code
  IO.println s!"SUMI_VERIFIER_TRANSITIONS={result}"
