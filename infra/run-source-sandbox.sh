#!/bin/sh
# Production upload parser boundary. Run as the dedicated, non-root worker user.
# There is deliberately no unsandboxed fallback and no configurable mount, runtime,
# limit, or environment override. A host must pass --probe before activation.
set -eu
umask 077
PATH=/usr/bin:/bin
export PATH
unset ENV BASH_ENV CDPATH NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH

ask_bill_reject() {
  printf '%s\n' "$1" >&2
  exit "$2"
}

ask_bill_mode=extract
if [ "$#" -eq 1 ] && [ "$1" = --probe ]; then
  ask_bill_mode=probe
else
  [ "$#" -eq 4 ] || ask_bill_reject SOURCE_SANDBOX_ARGUMENTS_INVALID 64
  [ "$1" = --max-old-space-size=192 ] || ask_bill_reject SOURCE_SANDBOX_ARGUMENTS_INVALID 64
  [ "$2" = /opt/ask-bill/apps/worker/source-import/extract.mjs ] || ask_bill_reject SOURCE_SANDBOX_ARGUMENTS_INVALID 64
  case "$3" in
    text/plain|text/markdown|application/xml|text/xml|application/pdf|application/vnd.openxmlformats-officedocument.wordprocessingml.document) ;;
    *) ask_bill_reject SOURCE_SANDBOX_ARGUMENTS_INVALID 64 ;;
  esac
  [ "${#4}" -eq 36 ] || ask_bill_reject SOURCE_SANDBOX_ARGUMENTS_INVALID 64
  printf '%s\n' "$4" | /usr/bin/grep -Eiq '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' ||
    ask_bill_reject SOURCE_SANDBOX_ARGUMENTS_INVALID 64
fi

# RLIMIT_NPROC does not constrain a real uid of zero. The production image uses
# USER node; refusing root also prevents a privileged caller weakening this rule.
[ "$(/usr/bin/id -u)" -ne 0 ] || ask_bill_reject SOURCE_SANDBOX_NON_ROOT_REQUIRED 78
for ask_bill_program in /usr/bin/env /usr/bin/timeout /usr/bin/prlimit /usr/bin/bwrap \
  /usr/local/bin/node /usr/bin/pdfinfo /usr/bin/pdftotext /usr/bin/pdftoppm /usr/bin/tesseract; do
  [ -x "$ask_bill_program" ] || ask_bill_reject SOURCE_SANDBOX_RUNTIME_UNAVAILABLE 78
done
for ask_bill_source in /opt/ask-bill/apps/worker/source-import/extract.mjs \
  /opt/ask-bill/packages/content/intake/index.mjs /opt/ask-bill/packages/content/parsers/index.mjs \
  /opt/ask-bill/packages/content/xml/index.mjs /opt/ask-bill/packages/content/xml/prolog.mjs \
  /opt/ask-bill/packages/content/pdf/index.mjs; do
  [ -f "$ask_bill_source" ] && [ -r "$ask_bill_source" ] || ask_bill_reject SOURCE_SANDBOX_LAYOUT_INVALID 78
done
for ask_bill_runtime in /usr/lib /usr/share/fonts /usr/share/tesseract-ocr /usr/share/poppler /etc/fonts; do
  [ -d "$ask_bill_runtime" ] || ask_bill_reject SOURCE_SANDBOX_RUNTIME_UNAVAILABLE 78
done

if [ "$ask_bill_mode" = probe ]; then
  # This fixed probe is part of the boundary, not a caller-supplied command. It
  # checks the same namespaces, mounts, environment and limits as real parsing.
  ask_bill_probe='
import {readFileSync,readdirSync,openSync,closeSync,writeFileSync,unlinkSync,existsSync,statfsSync} from "node:fs";
import {networkInterfaces} from "node:os";
import {createConnection} from "node:net";
const reject=()=>{throw new Error("SOURCE_SANDBOX_PROBE_FAILED")};
const assert=value=>{if(!value)reject()};
try {
  const expected={PATH:"/usr/local/bin:/usr/bin",LANG:"C.UTF-8",HOME:"/nonexistent",TMPDIR:"/tmp",PWD:"/tmp",
    UV_THREADPOOL_SIZE:"1",OMP_THREAD_LIMIT:"1",OMP_NUM_THREADS:"1",OPENBLAS_NUM_THREADS:"1",MALLOC_ARENA_MAX:"2"};
  assert(Object.keys(process.env).length===Object.keys(expected).length);
  for(const [key,value] of Object.entries(expected))assert(process.env[key]===value);
  assert(process.cwd()==="/tmp"&&process.getuid()===65534&&process.getgid()===65534);
  const status=readFileSync("/proc/self/status","utf8");
  assert(/^CapEff:\s+0+$/m.test(status)&&/^NoNewPrivs:\s+1$/m.test(status));
  assert(process.ppid===1&&process.pid>1);
  assert(process.execArgv.includes("--jitless")&&process.execArgv.includes("--max-old-space-size=192"));
  assert(typeof WebAssembly==="undefined");
  const limits=readFileSync("/proc/self/limits","utf8");
  const rows=[["Max cpu time",90],["Max file size",33554432],["Max data size",402653184],
    ["Max stack size",8388608],["Max core file size",0],["Max processes",32],["Max open files",64],
    ["Max locked memory",0],["Max address space",1073741824]];
  for(const [name,value] of rows){
    const row=limits.split("\n").find(line=>line.startsWith(name+" "));
    assert(row);const values=row.slice(name.length).trim().split(/\s+/);
    assert(values[0]===String(value)&&values[1]===String(value));
  }
  for(const path of ["/etc/passwd","/etc/resolv.conf","/root","/home","/run","/sys","/var","/workspace",
    "/opt/ask-bill/packages/db","/opt/ask-bill/apps/web","/opt/ask-bill/node_modules","/opt/ask-bill/.env",
    "/proc/1/root/etc/passwd"])assert(!existsSync(path));
  assert(readdirSync("/tmp").length===0);
  const temporary=statfsSync("/tmp");assert(temporary.bsize*temporary.blocks===67108864);
  writeFileSync("/tmp/probe","temporary",{mode:0o600,flag:"wx"});unlinkSync("/tmp/probe");
  for(const path of ["/probe","/usr/bin/probe","/opt/ask-bill/apps/worker/source-import/extract.mjs"]){
    let denied=false;
    try{const fd=openSync(path,"a");closeSync(fd)}catch(error){denied=["EROFS","EACCES","EPERM"].includes(error.code)}
    assert(denied);
  }
  assert(readFileSync("/opt/ask-bill/apps/worker/source-import/extract.mjs","utf8").length>0);
  // Static import failures must block worker activation, not appear on the first upload.
  const modules=await Promise.all([
    import("/opt/ask-bill/packages/content/intake/index.mjs"),
    import("/opt/ask-bill/packages/content/parsers/index.mjs"),
    import("/opt/ask-bill/packages/content/xml/index.mjs"),
    import("/opt/ask-bill/packages/content/pdf/index.mjs")]);
  assert(typeof modules[0].scanQuarantinedBytes==="function"&&typeof modules[1].parseDocx==="function"&&
    typeof modules[2].parseLegislativeXml==="function"&&typeof modules[3].previewPdf==="function");
  assert(Object.keys(networkInterfaces()).every(name=>name==="lo"));
  assert(readFileSync("/proc/net/route","utf8").trim().split("\n").length===1);
  await new Promise((resolve,rejectPromise)=>{
    const socket=createConnection({host:"198.51.100.1",port:443});
    const timer=setTimeout(()=>{socket.destroy();rejectPromise(new Error("SOURCE_SANDBOX_PROBE_FAILED"))},1000);
    socket.once("connect",()=>{clearTimeout(timer);socket.destroy();rejectPromise(new Error("SOURCE_SANDBOX_PROBE_FAILED"))});
    socket.once("error",error=>{clearTimeout(timer);socket.destroy();
      ["ENETUNREACH","EHOSTUNREACH","EPERM","EACCES"].includes(error.code)?resolve():rejectPromise(error)});
  });
  process.stdout.write(JSON.stringify({schema:"ask-bill-source-sandbox-v1",isolated:true,
    checks:{network:true,filesystem:true,environment:true,limits:true},
    limits:{cpuSeconds:90,addressBytes:1073741824,dataBytes:402653184,fileBytes:33554432,
      processes:32,openFiles:64,tmpBytes:67108864,wallSeconds:115}})+"\n");
}catch{process.stderr.write("SOURCE_SANDBOX_PROBE_FAILED\n");process.exitCode=78}
'
  set -- --max-old-space-size=192 --input-type=module -e "$ask_bill_probe"
fi

# Node 24 reserves a large executable code range by default. --jitless both removes
# that JIT surface and lets RLIMIT_AS bound the parser while leaving 192MiB of JS
# heap. RLIMIT_DATA also bounds anonymous native allocations. These are per-process
# ceilings: the hosting container must supply an aggregate memory/CPU cgroup limit.
set -- /usr/local/bin/node --jitless --max-semi-space-size=4 --v8-pool-size=1 "$@"
set -- --unshare-user --disable-userns --assert-userns-disabled --unshare-pid --unshare-net \
  --unshare-ipc --unshare-uts --unshare-cgroup --uid 65534 --gid 65534 --cap-drop ALL \
  --hostname ask-bill-parser --die-with-parent --new-session --clearenv \
  --setenv PATH /usr/local/bin:/usr/bin --setenv LANG C.UTF-8 --setenv HOME /nonexistent \
  --setenv TMPDIR /tmp --setenv PWD /tmp --setenv UV_THREADPOOL_SIZE 1 \
  --setenv OMP_THREAD_LIMIT 1 --setenv OMP_NUM_THREADS 1 --setenv OPENBLAS_NUM_THREADS 1 --setenv MALLOC_ARENA_MAX 2 \
  --ro-bind /usr/lib /usr/lib --symlink usr/lib /lib \
  --ro-bind /usr/local/bin/node /usr/local/bin/node \
  --ro-bind /usr/bin/pdfinfo /usr/bin/pdfinfo --ro-bind /usr/bin/pdftotext /usr/bin/pdftotext \
  --ro-bind /usr/bin/pdftoppm /usr/bin/pdftoppm --ro-bind /usr/bin/tesseract /usr/bin/tesseract \
  --ro-bind /usr/share/fonts /usr/share/fonts --ro-bind /usr/share/tesseract-ocr /usr/share/tesseract-ocr \
  --ro-bind /usr/share/poppler /usr/share/poppler --ro-bind /etc/fonts /etc/fonts \
  --ro-bind /opt/ask-bill/apps/worker/source-import/extract.mjs /opt/ask-bill/apps/worker/source-import/extract.mjs \
  --ro-bind /opt/ask-bill/packages/content/intake/index.mjs /opt/ask-bill/packages/content/intake/index.mjs \
  --ro-bind /opt/ask-bill/packages/content/parsers/index.mjs /opt/ask-bill/packages/content/parsers/index.mjs \
  --ro-bind /opt/ask-bill/packages/content/xml/index.mjs /opt/ask-bill/packages/content/xml/index.mjs \
  --ro-bind /opt/ask-bill/packages/content/xml/prolog.mjs /opt/ask-bill/packages/content/xml/prolog.mjs \
  --ro-bind /opt/ask-bill/packages/content/pdf/index.mjs /opt/ask-bill/packages/content/pdf/index.mjs \
  --proc /proc --remount-ro /proc --dev /dev --size 8388608 --tmpfs /dev/shm \
  --size 67108864 --perms 1777 --tmpfs /tmp --remount-ro / --chdir /tmp -- "$@"

# Dynamic linker/font configuration only. These optional paths vary by image
# architecture; missing security controls and required mounts are never optional.
if [ -d /usr/lib64 ]; then
  set -- --ro-bind /usr/lib64 /usr/lib64 --symlink usr/lib64 /lib64 "$@"
elif [ -d /lib64 ]; then
  set -- --ro-bind /lib64 /lib64 "$@"
fi
if [ -f /etc/ld.so.cache ]; then
  set -- --ro-bind /etc/ld.so.cache /etc/ld.so.cache "$@"
fi
if [ -d /usr/share/fontconfig ]; then
  set -- --ro-bind /usr/share/fontconfig /usr/share/fontconfig "$@"
fi

# exec keeps parent death/cancellation connected to timeout -> bwrap -> the PID
# namespace. bwrap kills the entire namespace when its reaper exits. Hard timeout
# and SIGKILL escalation remain effective even if a parser ignores SIGTERM.
exec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 \
  /usr/bin/timeout --signal=TERM --kill-after=2s 115s \
  /usr/bin/prlimit --cpu=90:90 --as=1073741824:1073741824 --data=402653184:402653184 \
  --stack=8388608:8388608 --fsize=33554432:33554432 --nproc=32:32 --nofile=64:64 \
  --core=0:0 --memlock=0:0 -- /usr/bin/bwrap "$@"
