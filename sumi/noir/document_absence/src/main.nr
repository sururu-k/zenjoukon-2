// Experimental statement: the public byte pattern does not occur in the
// committed private byte string. Lengths are public. This is not a PII detector.
fn main(
    document_bytes: [u8; 128],
    salt: [u8; 32],
    document_length: pub u32,
    forbidden: pub [u8; 8],
    forbidden_length: pub u32,
    commitment: pub [u8; 32],
) {
    assert(document_length <= 128);
    assert(forbidden_length > 0);
    assert(forbidden_length <= 8);

    for i in 0..128 {
        if i >= document_length { assert(document_bytes[i] == 0); }
    }
    for i in 0..8 {
        if i >= forbidden_length { assert(forbidden[i] == 0); }
    }
    let mut preimage = [0; 160];
    for i in 0..128 { preimage[i] = document_bytes[i]; }
    for i in 0..32 { preimage[128 + i] = salt[i]; }
    assert(std::hash::blake2s(preimage) == commitment);

    for position in 0..128 {
        let mut matches = true;
        for j in 0..8 {
            let index = if position + j < 128 { position + j } else { 0 };
            if (j < forbidden_length) & (document_bytes[index] != forbidden[j]) {
                matches = false;
            }
        }
        if position + forbidden_length <= document_length {
            assert(!matches);
        }
    }
}
