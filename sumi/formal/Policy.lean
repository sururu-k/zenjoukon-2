import Std

/-!
Sumiの有限な認可モデル。JavaScript実行系、UIの本人確認、機密分類の正しさ、OS全体は証明対象に含まない。
Nyxisの「正本のルールと実行の分離」を参考にした独自モデルで、Nyxisを依存に持たない。
-/
namespace Sumi

inductive Label where
  | publicData | internalData | confidential | unknown
  deriving DecidableEq, Repr

inductive Action where
  | copy | exportFile | saveEncrypted | infer
  deriving DecidableEq, Repr

inductive Sink where
  | clipboard | shareFile | encryptedDraft | localAI | unregistered
  deriving DecidableEq, Repr

structure Request where
  label : Label
  action : Action
  sink : Sink
  reviewed : Bool
  fresh : Bool
  encrypted : Bool
  consented : Bool
  loopback : Bool
  deriving Repr

def allows (r : Request) : Bool :=
  if r.label == .unknown then false
  else if !r.fresh then false
  else match r.action, r.sink with
    | .copy, .clipboard | .exportFile, .shareFile => r.label == .publicData && r.reviewed
    | .saveEncrypted, .encryptedDraft => r.encrypted
    | .infer, .localAI => r.consented && r.loopback
    | _, _ => false

theorem unknown_denied (r : Request) (h : r.label = .unknown) : allows r = false := by
  simp [allows, h]

theorem stale_denied (r : Request) (h : r.fresh = false) : allows r = false := by
  simp [allows, h]

theorem unregistered_denied (r : Request) (h : r.sink = .unregistered) : allows r = false := by
  cases ha : r.action <;> simp [allows, h, ha]

theorem plaintext_requires_public_review (r : Request)
    (h : r.action = .copy ∨ r.action = .exportFile)
    (ok : allows r = true) : r.label = .publicData ∧ r.reviewed = true ∧ r.fresh = true := by
  cases r with
  | mk label action sink reviewed fresh encrypted consented loopback =>
    cases label <;> cases action <;> cases sink <;> cases reviewed <;> cases fresh <;>
      simp_all [allows]

theorem draft_requires_encryption (r : Request) (h : r.action = .saveEncrypted)
    (ok : allows r = true) : r.encrypted = true ∧ r.fresh = true := by
  cases r with
  | mk label action sink reviewed fresh encrypted consented loopback =>
    cases label <;> cases action <;> cases sink <;> cases fresh <;> cases encrypted <;>
      simp_all [allows]

theorem inference_requires_local_consent (r : Request) (h : r.action = .infer)
    (ok : allows r = true) : r.consented = true ∧ r.loopback = true ∧ r.fresh = true := by
  cases r with
  | mk label action sink reviewed fresh encrypted consented loopback =>
    cases label <;> cases action <;> cases sink <;> cases fresh <;> cases consented <;> cases loopback <;>
      simp_all [allows]

end Sumi

#print axioms Sumi.unknown_denied
#print axioms Sumi.stale_denied
#print axioms Sumi.unregistered_denied
#print axioms Sumi.plaintext_requires_public_review
#print axioms Sumi.draft_requires_encryption
#print axioms Sumi.inference_requires_local_consent

def main : IO Unit := do
  let labels : List Sumi.Label := [.publicData, .internalData, .confidential, .unknown]
  let actions : List Sumi.Action := [.copy, .exportFile, .saveEncrypted, .infer]
  let sinks : List Sumi.Sink := [.clipboard, .shareFile, .encryptedDraft, .localAI, .unregistered]
  let mut bits := ""
  for label in labels do
    for action in actions do
      for sink in sinks do
        for flags in [:32] do
          let r := Sumi.Request.mk label action sink
            (flags % 2 == 1) ((flags / 2) % 2 == 1) ((flags / 4) % 2 == 1)
            ((flags / 8) % 2 == 1) ((flags / 16) % 2 == 1)
          bits := bits ++ (if Sumi.allows r then "1" else "0")
  IO.println s!"SUMI_POLICY_DECISIONS={bits}"
