# Restricted PDF processing (AB-016)

1. Start with validated, tenant-bound, immutable original PDF bytes in Ask Bill quarantine.
2. Optionally build the isolated review image from the repository root: `docker build -f apps/worker/sandbox/pdf.Dockerfile -t ask-bill-pdf:ab-016 .`.
3. Run only within isolated worker host: `bash apps/worker/sandbox/pdf-run.sh /path/to/private.pdf`. This runner mounts a single document and only the local parser; no API/database credentials or network connectivity are provided.
4. Inspect the returned page count, extraction warnings and provenance checksum; compare displayed pages and text before any publisher review. The CLI deliberately omits private extracted text from stdout.
5. OCR requires explicit opting in and the tesseract backend; low confidence, blank pages, incomplete page ranges and unreviewed source are not publishable.

The adapter supports a maximum of 300 input pages, defaults to processing 20 and previewing page 1; it never claims unprocessed pages were extracted. PNG hashes are private proof metadata, not publicly hosted assets. No automatic publishing, signed private object storage or browser correction UI is enabled.
