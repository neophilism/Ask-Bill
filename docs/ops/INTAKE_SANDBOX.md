# AB-014: quarantined document preflight

The standalone sandbox performs bounded validation only; **it never publishes, authorizes or extracts source text**. Allowed types: plain text, Markdown, XML, PDF, DOCX. It checks document magic, encoding, dangerous XML directives, active PDF actions, ZIP signatures, ZIP member sizes, compression ratio, CRC, path safety and DOCX embedded active objects. A malicious or unknown file fails closed.

On a host with Docker and an explicitly pre-pulled node:24.19.0-alpine image, run:
    bash apps/worker/sandbox/run.sh /path/to/private/test-file text/plain

The container uses --network none, --read-only, --cap-drop ALL, --security-opt no-new-privileges, a nonroot user and 256 MiB/CPU/PID ceilings. Only the selected file plus restricted scanner code are mounted read-only. No service keys or other repository contents enter the sandbox.

This is not an antivirus scanner or hardened PDF parser. PDF preflight can miss obfuscated active content; the later AB-016 PDF parser and review path must remain separate. Production upload and publication remain disabled pending operational tests including verified seccomp and source review.
