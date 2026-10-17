# Source status and version-switching controls (AB-021)

Display the exact selected version ID, law status, authoritative source and verification timestamp alongside citations. A bill passed by one chamber remains different from enacted law; enactment is different from the date provisions become effective. When stale, explicitly warn of elapsed freshness window and link to the last verified official source; never silently assume a newer version or update old answers.

A visitor must explicitly change selected version. On switch: increment the conversation epoch; cancel obsolete answer, speech, animated cue and tour; clear previous citations and derived caches. Restore navigation only after anchors are verified against the newly selected version.

The current repository implements this contract but not the live bill picker. Do not enable a fictitious current-law status from the existing incomplete electronic-filing fixture.
