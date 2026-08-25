# Transcription QA Workflow Specification

## Overview
In the **Segment-by-Segment Transcription Review** popup (accessible via the Admin Transcription dashboard at `/admin/transcription`), clicking **"View Segment"** on any individual segment will route the QA reviewer directly to the interactive **Tier 1 (Sentence Text)** and **Tier 2 (Word-Level Timestamps)** transcription editor interface—identical to the contributor transcription studio—with full QA administrative controls.

---

## Key Requirements & User Story

1. **Navigation Entry Point**:
   - In the Segment Inspector modal for any dialogue call, each segment row will feature a dedicated **`View / Edit Segment`** button.
   - Clicking this opens the full interactive Transcription Studio for that specific segment (`call_id` + `segment_id`).

2. **Dual-Tier QA Editing Interface**:
   - **Tier 1: Sentence-Level Text Transcript**:
     - Audio slice playback for the specific segment time boundaries (`start_sec` to `end_sec`).
     - Interactive transcript text box allowing QA reviewers to fix typos, orthography, transliteration errors, or missing tags (e.g. `[laughter]`, `[applause]`, `[overlap]`, `[music]`).
     - Tier 1 approval/rejection toggle.
   - **Tier 2: Word-Level Timestamp Editor & Alignment**:
     - Visual word chip editor showing start/end timestamps for each individual token.
     - Click-to-listen playback per word slice.
     - Drag/adjust timing boundaries and re-align words directly.
     - Option to trigger or re-run automated alignment (WhisperX / Sarvam ASR).

3. **QA Decision Controls**:
   - **✓ Approve Segment**: Marks `QAVerified: true`, records `qa_verified_by` and timestamp, and auto-advances to the next unreviewed segment in the call.
   - **✕ Reject / Flag Segment**: Marks segment with rejection reason / QA notes so contributors or lead reviewers can re-transcribe.
   - **💾 Save Changes**: Saves manual QA edits to text and word timestamps directly to MongoDB and the segmentation labels JSON.

4. **Call-Level Progress Tracking**:
   - Progress bar updates dynamically as segments are individually verified (e.g. `189 / 189 QA Approved`).
   - The entire call transitions to **`🌟 QA Reviewed`** only once 100% of its segments have been QA approved.
