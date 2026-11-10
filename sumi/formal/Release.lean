import Std

/- A model of reviewed releases, not a verification of the JavaScript runtime. -/
namespace SumiRelease

inductive Destination where
  | clipboard | shareFile
  deriving DecidableEq, Repr

structure Snapshot where
  text : String
  policy : String
  revision : Nat
  destination : Destination
  deriving DecidableEq, Repr

structure State where
  current : Snapshot
  approval : Option Snapshot
  deriving Repr

inductive Command where
  | edit (text policy : String)
  | changeDestination (destination : Destination)
  | approve
  | revoke
  | release (destination : Destination)
  deriving Repr

structure Event where
  released : Snapshot
  currentAtEmission : Snapshot
  approvalAtEmission : Option Snapshot
  deriving Repr

def step (s : State) (command : Command) : State × Option Event :=
  match command with
  | .edit text policy =>
    ({ current := { s.current with text := text, policy := policy, revision := s.current.revision + 1 }, approval := none }, none)
  | .changeDestination destination =>
    ({ current := { s.current with destination := destination, revision := s.current.revision + 1 }, approval := none }, none)
  | .approve => ({ s with approval := some s.current }, none)
  | .revoke => ({ s with approval := none }, none)
  | .release destination =>
    if s.approval == some s.current && destination == s.current.destination then
      (s, some ⟨s.current, s.current, s.approval⟩)
    else (s, none)

def ValidEvent (e : Event) : Prop :=
  e.released = e.currentAtEmission ∧ e.approvalAtEmission = some e.currentAtEmission

theorem emitted_is_current_and_approved (s : State) (c : Command) (e : Event)
    (h : (step s c).2 = some e) : ValidEvent e := by
  cases c with
  | edit text policy => simp [step] at h
  | changeDestination destination => simp [step] at h
  | approve => simp [step] at h
  | revoke => simp [step] at h
  | release destination =>
    simp only [step] at h
    split at h
    next condition =>
      have approved : s.approval = some s.current := by
        simpa using (Bool.and_eq_true_iff.mp condition).1
      simp only [Option.some.injEq] at h
      subst e
      exact ⟨rfl, approved⟩
    next => simp at h

theorem edit_revokes (s : State) (text policy : String) :
    (step s (.edit text policy)).1.approval = none := rfl

theorem destination_change_revokes (s : State) (destination : Destination) :
    (step s (.changeDestination destination)).1.approval = none := rfl

theorem unapproved_emits_nothing (s : State) (destination : Destination)
    (h : s.approval = none) : (step s (.release destination)).2 = none := by
  simp [step, h]

theorem wrong_destination_emits_nothing (s : State) (destination : Destination)
    (h : destination ≠ s.current.destination) : (step s (.release destination)).2 = none := by
  simp [step, h]

theorem edit_then_release_emits_nothing (s : State) (text policy : String)
    (destination : Destination) :
    (step (step s (.edit text policy)).1 (.release destination)).2 = none := by
  apply unapproved_emits_nothing
  exact edit_revokes s text policy

def run (s : State) : List Command → List Event
  | [] => []
  | c :: cs =>
    let (next, event) := step s c
    event.toList ++ run next cs

theorem every_emission_is_current_and_approved (s : State) (commands : List Command) :
    ∀ e ∈ run s commands, ValidEvent e := by
  induction commands generalizing s with
  | nil => simp [run]
  | cons c cs ih =>
    intro e member
    simp only [run, List.mem_append] at member
    rcases member with first | later
    · cases h : (step s c).2 with
      | none => simp [h] at first
      | some event =>
        simp [h] at first
        subst e
        exact emitted_is_current_and_approved s c event h
    · exact ih _ e later

end SumiRelease

#print axioms SumiRelease.edit_revokes
#print axioms SumiRelease.destination_change_revokes
#print axioms SumiRelease.unapproved_emits_nothing
#print axioms SumiRelease.wrong_destination_emits_nothing
#print axioms SumiRelease.edit_then_release_emits_nothing
#print axioms SumiRelease.emitted_is_current_and_approved
#print axioms SumiRelease.every_emission_is_current_and_approved
