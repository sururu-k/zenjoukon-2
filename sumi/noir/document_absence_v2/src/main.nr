// Experimental exact-byte absence for up to four public patterns.
// Length, policy, and commitment are public; padded document and salt private.
fn main(
    document_bytes: [u8; 512],
    salt: [u8; 32],
    document_length: pub u32,
    forbidden: pub [[u8; 16]; 4],
    forbidden_lengths: pub [u32; 4],
    forbidden_count: pub u32,
    commitment: pub [u8; 32],
) {
    assert(document_length <= 512);
    assert(forbidden_count > 0);
    assert(forbidden_count <= 4);
    for i in 0..512 {
        if i >= document_length { assert(document_bytes[i] == 0); }
    }
    for term in 0..4 {
        if term < forbidden_count {
            assert(forbidden_lengths[term] > 0);
            assert(forbidden_lengths[term] <= 16);
        } else {
            assert(forbidden_lengths[term] == 0);
        }
        for j in 0..16 {
            if j >= forbidden_lengths[term] { assert(forbidden[term][j] == 0); }
        }
    }
    let mut preimage = [0; 544];
    for i in 0..512 { preimage[i] = document_bytes[i]; }
    for i in 0..32 { preimage[512 + i] = salt[i]; }
    assert(std::hash::blake2s(preimage) == commitment);
    for term in 0..4 {
        for position in 0..512 {
            let mut matches = true;
            for j in 0..16 {
                let index = if position + j < 512 { position + j } else { 0 };
                if (j < forbidden_lengths[term]) & (document_bytes[index] != forbidden[term][j]) {
                    matches = false;
                }
            }
            if (term < forbidden_count) & (position + forbidden_lengths[term] <= document_length) {
                assert(!matches);
            }
        }
    }
}
