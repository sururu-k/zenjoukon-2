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

/- The information-flow selector is shared by every application egress path.
   Public is the explicitly approved/declassified view. Ciphertext is a
   separate type: these theorems do not assert cryptographic indistinguishability
   or hide time, failures, output existence, or a compromised browser/OS. -/
inductive Channel where
  | none | clipboard | shareFile | encryptedDraft | localAI
  deriving DecidableEq, Repr

def channel (r : Request) : Channel :=
  if allows r then match r.action with
    | .copy => .clipboard
    | .exportFile => .shareFile
    | .saveEncrypted => .encryptedDraft
    | .infer => .localAI
  else .none

inductive Effect (Public Secret Cipher : Type) where
  | clipboard : Public → Effect Public Secret Cipher
  | shareFile : Public → Effect Public Secret Cipher
  | encryptedDraft : Cipher → Effect Public Secret Cipher
  | localAI : Secret → Effect Public Secret Cipher
  deriving Repr

variable {Public Secret Cipher : Type}

def emit (r : Request) (released : Public) (secret : Secret) (sealed : Cipher) :
    List (Effect Public Secret Cipher) :=
  match channel r with
  | .none => []
  | .clipboard => [.clipboard released]
  | .shareFile => [.shareFile released]
  | .encryptedDraft => [.encryptedDraft sealed]
  | .localAI => [.localAI secret]

def externalPlaintext (events : List (Effect Public Secret Cipher)) : List Public :=
  events.filterMap fun event => match event with
    | .clipboard p | .shareFile p => some p
    | .encryptedDraft _ | .localAI _ => none

def releaseProjection (r : Request) (released : Public) : List Public :=
  match channel r with
  | .clipboard | .shareFile => [released]
  | _ => []

theorem denied_emits_nothing (r : Request) (h : allows r = false)
    (released : Public) (secret : Secret) (sealed : Cipher) :
    emit r released secret sealed = [] := by
  simp [emit, channel, h]

theorem plaintext_depends_only_on_release (r : Request) (released : Public)
    (secret : Secret) (sealed : Cipher) :
    externalPlaintext (emit r released secret sealed) = releaseProjection r released := by
  cases h : channel r <;> simp [emit, externalPlaintext, releaseProjection, h]

theorem external_plaintext_noninterference (r : Request) (released : Public)
    (secret₁ secret₂ : Secret) (sealed₁ sealed₂ : Cipher) :
    externalPlaintext (emit r released secret₁ sealed₁) =
      externalPlaintext (emit r released secret₂ sealed₂) := by
  rw [plaintext_depends_only_on_release, plaintext_depends_only_on_release]

def runPlaintext (program : List (Request × Public)) (secrets : Nat → Secret)
    (ciphertexts : Nat → Cipher) (offset : Nat) : List Public :=
  match program with
  | [] => []
  | (r, released) :: rest =>
    externalPlaintext (emit r released (secrets offset) (ciphertexts offset)) ++
      runPlaintext rest secrets ciphertexts (offset + 1)

theorem trace_plaintext_noninterference (program : List (Request × Public))
    (secrets₁ secrets₂ : Nat → Secret) (ciphertexts₁ ciphertexts₂ : Nat → Cipher)
    (offset : Nat) :
    runPlaintext program secrets₁ ciphertexts₁ offset =
      runPlaintext program secrets₂ ciphertexts₂ offset := by
  induction program generalizing offset with
  | nil => rfl
  | cons item rest ih =>
    rcases item with ⟨r, released⟩
    simp only [runPlaintext, plaintext_depends_only_on_release]
    rw [ih]

theorem only_approved_plaintext (r : Request) (released : Public)
    (secret : Secret) (sealed : Cipher) :
    externalPlaintext (emit r released secret sealed) = [] ∨
      externalPlaintext (emit r released secret sealed) = [released] := by
  cases h : channel r <;> simp [emit, externalPlaintext, h]

end Sumi

#print axioms Sumi.unknown_denied
#print axioms Sumi.stale_denied
#print axioms Sumi.unregistered_denied
#print axioms Sumi.plaintext_requires_public_review
#print axioms Sumi.draft_requires_encryption
#print axioms Sumi.inference_requires_local_consent
#print axioms Sumi.denied_emits_nothing
#print axioms Sumi.plaintext_depends_only_on_release
#print axioms Sumi.external_plaintext_noninterference
#print axioms Sumi.trace_plaintext_noninterference
#print axioms Sumi.only_approved_plaintext

def main : IO Unit := do
  let labels : List Sumi.Label := [.publicData, .internalData, .confidential, .unknown]
  let actions : List Sumi.Action := [.copy, .exportFile, .saveEncrypted, .infer]
  let sinks : List Sumi.Sink := [.clipboard, .shareFile, .encryptedDraft, .localAI, .unregistered]
  let mut bits := ""
  let mut channels := ""
  for label in labels do
    for action in actions do
      for sink in sinks do
        for flags in [:32] do
          let r := Sumi.Request.mk label action sink
            (flags % 2 == 1) ((flags / 2) % 2 == 1) ((flags / 4) % 2 == 1)
            ((flags / 8) % 2 == 1) ((flags / 16) % 2 == 1)
          bits := bits ++ (if Sumi.allows r then "1" else "0")
          channels := channels ++ (match Sumi.channel r with
            | .none => "0" | .clipboard => "1" | .shareFile => "2"
            | .encryptedDraft => "3" | .localAI => "4")
  IO.println s!"SUMI_POLICY_DECISIONS={bits}"
  IO.println s!"SUMI_FLOW_CHANNELS={channels}"
