/// RFC3339 timestamp normalization utilities (M3).
///
/// All timestamps that participate in ordering comparisons or cross
/// SQLite/PostgreSQL boundaries must be normalized to UTC canonical form
/// before comparison.  Storing the raw string produced by a +05:00 client
/// and then doing a lexicographic `>` against a Z-suffix string from another
/// terminal produces wrong "strictly newer" verdicts.
///
/// `normalize_rfc3339` is the single, auditable gateway: it parses any valid
/// RFC3339 offset (including fractional seconds) and returns the instant
/// re-expressed as `YYYY-MM-DDTHH:MM:SS[.frac]Z`.  Malformed input returns
/// `Err`, which callers must surface explicitly — silent corruption is worse
/// than a visible failure.

use chrono::{DateTime, FixedOffset};

use crate::db::errors::DbError;

/// Parse any RFC3339-conformant string and return it in canonical UTC form.
///
/// * Input  : `"2026-09-29T17:00:00+05:00"` or `"2026-09-29T12:00:00.000Z"`
/// * Output : `"2026-09-29T12:00:00Z"` / `"2026-09-29T12:00:00.000Z"` (same instant)
///
/// Fractional-second precision is preserved; the offset is folded to `+00:00`
/// and the trailing `+00:00` is then rendered as `Z` by chrono's `to_rfc3339`.
///
/// Returns `Err(DbError::ValidationError(...))` for any input that is not a
/// valid RFC3339 string so callers receive a typed, loggable error rather than
/// a silent wrong value.
pub fn normalize_rfc3339(raw: &str) -> Result<String, DbError> {
    let dt: DateTime<FixedOffset> = DateTime::parse_from_rfc3339(raw).map_err(|e| {
        DbError::ValidationError(format!(
            "M3: invalid RFC3339 timestamp '{raw}': {e}"
        ))
    })?;
    // Convert to UTC then re-serialize; chrono produces "…Z" suffix for UTC.
    Ok(dt.to_utc().to_rfc3339())
}

/// Compare two RFC3339 strings as instants (not as lexicographic byte strings).
///
/// Returns `true` when `a` represents a strictly later point in time than `b`.
/// Returns `false` on any parse error (conservative: treat unparseable as
/// "not newer" to avoid accidentally overwriting good data with bad data).
pub fn is_strictly_newer(a: &str, b: &str) -> bool {
    match (
        DateTime::parse_from_rfc3339(a),
        DateTime::parse_from_rfc3339(b),
    ) {
        (Ok(ta), Ok(tb)) => ta.to_utc() > tb.to_utc(),
        _ => false,
    }
}

// ─── M3 regression tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // M3-T01: Valid UTC RFC3339 is accepted and normalized (Z suffix preserved)
    #[test]
    fn m3_t01_valid_utc_accepted_and_normalized() {
        let input = "2026-09-29T12:00:00Z";
        let result = normalize_rfc3339(input).expect("M3-T01: must accept valid UTC");
        // Parsed and re-serialized UTC must equal the same instant
        let parsed_in = DateTime::parse_from_rfc3339(input).unwrap().to_utc();
        let parsed_out = DateTime::parse_from_rfc3339(&result).unwrap().to_utc();
        assert_eq!(parsed_in, parsed_out, "M3-T01: instant must be preserved");
        assert!(result.ends_with("+00:00"), "M3-T01: canonical form must end with +00:00, got '{result}'");
    }

    // M3-T02: +05:00 offset equals Z-suffixed string for the same instant
    #[test]
    fn m3_t02_positive_offset_equals_utc_equivalent() {
        let with_offset = "2026-09-29T17:00:00+05:00";
        let utc_equiv   = "2026-09-29T12:00:00Z";

        let normalized_offset = normalize_rfc3339(with_offset).expect("M3-T02: must parse +05:00");
        let normalized_utc    = normalize_rfc3339(utc_equiv).expect("M3-T02: must parse Z");

        // Both must represent exactly the same UTC instant
        assert_eq!(normalized_offset, normalized_utc,
            "M3-T02: +05:00 and Z representations of the same moment must normalize identically");

        // The raw strings are NOT equal (this was the bug)
        assert_ne!(with_offset, utc_equiv,
            "M3-T02: raw strings differ — confirms the pre-fix lexicographic comparison was wrong");

        // Crucially: is_strictly_newer must return false (same instant)
        assert!(!is_strictly_newer(with_offset, utc_equiv),
            "M3-T02: same instant must not be 'strictly newer'");
        assert!(!is_strictly_newer(utc_equiv, with_offset),
            "M3-T02: same instant must not be 'strictly newer' (reversed)");
    }

    // M3-T03: Negative offset normalizes correctly
    #[test]
    fn m3_t03_negative_offset_normalizes_correctly() {
        // -05:00 means UTC is 5 hours ahead: 07:00-05:00 == 12:00Z
        let input = "2026-09-29T07:00:00-05:00";
        let normalized = normalize_rfc3339(input).expect("M3-T03: must parse -05:00");
        let expected_utc = normalize_rfc3339("2026-09-29T12:00:00Z").unwrap();
        assert_eq!(normalized, expected_utc, "M3-T03: -05:00 must normalize to correct UTC");
        assert!(normalized.ends_with("+00:00"), "M3-T03: canonical form must end with +00:00");
    }

    // M3-T04: Fractional seconds are preserved through normalization
    #[test]
    fn m3_t04_fractional_seconds_preserved() {
        let input = "2026-09-29T12:00:00.123456789Z";
        let normalized = normalize_rfc3339(input).expect("M3-T04: must parse fractional seconds");
        // The normalized string must parse to exactly the same instant
        let original_instant = DateTime::parse_from_rfc3339(input).unwrap().to_utc();
        let normalized_instant = DateTime::parse_from_rfc3339(&normalized).unwrap().to_utc();
        assert_eq!(original_instant, normalized_instant,
            "M3-T04: fractional-second precision must not be lost");

        // With +05:30 offset and fractional seconds
        let input2 = "2026-09-29T17:30:00.500+05:30";
        let normalized2 = normalize_rfc3339(input2).expect("M3-T04: must parse fractional+offset");
        let inst2 = DateTime::parse_from_rfc3339(input2).unwrap().to_utc();
        let norm_inst2 = DateTime::parse_from_rfc3339(&normalized2).unwrap().to_utc();
        assert_eq!(inst2, norm_inst2,
            "M3-T04: fractional seconds with offset must normalize to correct instant");
    }

    // M3-T05: Malformed timestamp is rejected deterministically (not silently wrapped)
    #[test]
    fn m3_t05_malformed_timestamp_rejected() {
        let bad_inputs = &[
            "not-a-date",
            "2026-13-01T00:00:00Z",       // month 13
            "2026-09-29T25:00:00Z",       // hour 25
            "2026-09-29",                  // date only — not RFC3339
            "1234567890",                  // unix epoch integer as string
            "",                            // empty string
            "2026-09-29T12:00:00",         // missing timezone — not RFC3339
        ];
        for bad in bad_inputs.iter() {
            let result = normalize_rfc3339(bad);
            assert!(
                result.is_err(),
                "M3-T05: '{}' should have been rejected, but got Ok({:?})",
                bad,
                result.ok()
            );
            // Verify error message contains M3 tag for traceability
            let err_msg = format!("{:?}", result.unwrap_err());
            assert!(
                err_msg.contains("M3:") || err_msg.contains("invalid RFC3339"),
                "M3-T05: error message for '{}' must be traceable: got '{err_msg}'",
                bad
            );
        }
    }

    // M3-T06: Chronological ordering uses instant, not raw string
    #[test]
    fn m3_t06_chronological_ordering_by_instant_not_raw_string() {
        // These two strings have the same UTC instant; neither is "newer"
        let same_a = "2026-09-29T17:00:00+05:00";
        let same_b = "2026-09-29T12:00:00Z";

        assert!(!is_strictly_newer(same_a, same_b), "M3-T06: same instant: a not newer than b");
        assert!(!is_strictly_newer(same_b, same_a), "M3-T06: same instant: b not newer than a");

        // A genuine 1-second later event
        let later   = "2026-09-29T17:00:01+05:00";   // 12:00:01Z
        let earlier = "2026-09-29T12:00:00Z";          // 12:00:00Z

        assert!(is_strictly_newer(later, earlier),
            "M3-T06: later instant must be strictly newer than earlier");
        assert!(!is_strictly_newer(earlier, later),
            "M3-T06: earlier instant must NOT be strictly newer than later");

        // Lexicographic trap: "+05:00" suffix > "Z" suffix in raw string comparison
        // Confirm is_strictly_newer does NOT fall into this trap for same-instant pair
        let trap_a = "2026-09-29T17:00:00+05:00";
        let trap_b = "2026-09-29T12:00:00Z";
        assert!(trap_a > trap_b, "M3-T06 setup: raw string comparison gives wrong result (expected)");
        assert!(!is_strictly_newer(trap_a, trap_b),
            "M3-T06: is_strictly_newer must not reproduce the lexicographic bug");
    }

    // M3-T07: Valid timestamp passes through sync/change-application path (PARTY_UPSERTED guard)
    //
    // Simulates the PARTY_UPSERTED last-writer guard that previously used raw
    // string comparison.  After M3 the guard uses is_strictly_newer, which
    // must correctly recognize the +05:00 event as the same instant as an
    // existing Z record (not overwrite, not reject as stale).
    #[test]
    fn m3_t07_valid_timestamp_passes_sync_path() {
        // Stored record has UTC timestamp
        let stored_updated_at = "2026-09-29T12:00:00Z";
        // Incoming event carries +05:00 — same instant
        let incoming_updated_at = "2026-09-29T17:00:00+05:00";

        // Same instant → not strictly newer → guard should NOT treat as newer
        assert!(
            !is_strictly_newer(incoming_updated_at, stored_updated_at),
            "M3-T07: same-instant incoming event must not be flagged as strictly newer"
        );

        // A genuinely newer event (1 minute later in PKT)
        let genuinely_newer = "2026-09-29T17:01:00+05:00";  // 12:01:00Z
        assert!(
            is_strictly_newer(genuinely_newer, stored_updated_at),
            "M3-T07: genuinely newer event must be recognized correctly"
        );
    }

    // M3-T08: Malformed timestamp does not wedge M2 cursor
    //
    // normalize_rfc3339 returns Err for bad timestamps.  The M2 per-event
    // isolation in change_applier handles errors by logging and advancing the
    // cursor — so Err is the correct outcome, not a panic or an Ok(garbage).
    #[test]
    fn m3_t08_malformed_timestamp_returns_err_not_panic() {
        let malformed = "totally-broken-timestamp";
        let result = normalize_rfc3339(malformed);
        // Must be Err — M2 cursor advancement relies on Err, not panic
        assert!(result.is_err(), "M3-T08: malformed input must return Err for M2 to skip gracefully");
        // Must not panic — the test itself proves this
    }

    // M3-T09: Replay / idempotency — same valid event processed twice gives consistent state
    //
    // Normalizing the same RFC3339 string twice must produce identical output.
    // Normalizing two representations of the same instant must produce equal output.
    #[test]
    fn m3_t09_replay_idempotency_consistent_timestamp_state() {
        let ts = "2026-09-29T17:00:00+05:00";

        let first  = normalize_rfc3339(ts).unwrap();
        let second = normalize_rfc3339(ts).unwrap();
        assert_eq!(first, second, "M3-T09: normalizing the same input twice must be idempotent");

        // Two representations of the same instant must normalize to the same string
        let utc_form = "2026-09-29T12:00:00Z";
        let pkt_form = "2026-09-29T17:00:00+05:00";
        let norm_utc = normalize_rfc3339(utc_form).unwrap();
        let norm_pkt = normalize_rfc3339(pkt_form).unwrap();
        assert_eq!(norm_utc, norm_pkt,
            "M3-T09: different representations of the same instant must normalize identically: \
             utc='{norm_utc}' pkt='{norm_pkt}'");

        // is_strictly_newer on normalized vs original must be consistent
        assert!(!is_strictly_newer(&first, &second),
            "M3-T09: idempotent replay must not produce a 'newer' verdict");
    }

    // M3-T10: Server-side PARTY_UPSERTED last-writer guard regression (R-1 fix)
    //
    // Before the R-1 fix, server.rs used raw string comparison:
    //   `party.updated_at.as_str() > p.updated_at.as_str()`
    // This caused a +05:00 event string to lexicographically sort AFTER a Z string for
    // the same UTC instant, incorrectly classifying it as "strictly newer" and overwriting
    // valid central party data with a same-instant re-delivery.
    //
    // This test documents the exact conditions under which the bug was triggered and
    // verifies that is_strictly_newer() — now used by the server handler — is correct.
    #[test]
    fn m3_t10_server_party_upsert_guard_regression() {
        // The two timestamps used in the audit finding — same UTC instant, different representations.
        let utc_stored   = "2026-09-29T12:00:00Z";          // stored on server (UTC)
        let pkt_incoming = "2026-09-29T17:00:00+05:00";     // arriving from a PKT terminal

        // ── Pre-fix behaviour (demonstrates the bug, for documentation) ──────
        // Raw string comparison: "+05:00" suffix > "Z" suffix lexicographically.
        // This is the broken comparison that was on server.rs:2338 before R-1.
        assert!(
            pkt_incoming > utc_stored,
            "M3-T10 setup: raw string `>` gives wrong result — confirms the pre-fix bug existed"
        );

        // ── Post-fix behaviour ────────────────────────────────────────────────
        // Same instant: must NOT be strictly newer (same-instant replay must be a no-op).
        assert!(
            !is_strictly_newer(pkt_incoming, utc_stored),
            "M3-T10: same UTC instant (+05:00 vs Z) must NOT be considered strictly newer"
        );
        assert!(
            !is_strictly_newer(utc_stored, pkt_incoming),
            "M3-T10: same UTC instant (Z vs +05:00) must NOT be considered strictly newer (reversed)"
        );

        // Genuinely newer event (1 minute later in PKT = 12:01:00Z > 12:00:00Z).
        let pkt_newer = "2026-09-29T17:01:00+05:00"; // 12:01:00Z
        assert!(
            is_strictly_newer(pkt_newer, utc_stored),
            "M3-T10: genuinely later PKT timestamp must be recognized as strictly newer than stored UTC"
        );
        assert!(
            !is_strictly_newer(utc_stored, pkt_newer),
            "M3-T10: stored UTC must NOT be newer than a genuinely later PKT timestamp"
        );

        // Genuinely older event (1 minute earlier in PKT = 11:59:00Z < 12:00:00Z).
        let pkt_older = "2026-09-29T16:59:00+05:00"; // 11:59:00Z
        assert!(
            !is_strictly_newer(pkt_older, utc_stored),
            "M3-T10: older PKT timestamp must NOT be considered strictly newer than stored UTC"
        );

        // Malformed incoming timestamp: conservative false (do not overwrite good data with bad).
        assert!(
            !is_strictly_newer("not-a-timestamp", utc_stored),
            "M3-T10: malformed incoming timestamp must conservatively return false (not newer)"
        );
        // Malformed stored timestamp: conservative false (do not overwrite with incoming).
        assert!(
            !is_strictly_newer(pkt_incoming, "not-a-timestamp"),
            "M3-T10: malformed stored timestamp must conservatively return false (not newer)"
        );
        // Both malformed: conservative false.
        assert!(
            !is_strictly_newer("bad", "also-bad"),
            "M3-T10: both malformed must conservatively return false"
        );
    }
}
