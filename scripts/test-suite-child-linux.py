"""Own direct test ancestry with a Linux subreaper and pinned pidfd cleanup."""
import ctypes
import datetime
import errno
import json
import os
import select
import signal
import sys
import tempfile
import threading
import time

disconnected = threading.Event()
communication_error = None
request = None


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def identity(pid):
    with open(f"/proc/{pid}/stat", encoding="ascii") as source:
        stat = source.read()
    fields = stat[stat.rfind(")") + 2:].split()
    with open("/proc/sys/kernel/random/boot_id", encoding="ascii") as source:
        boot = source.read().strip()
    if not boot or not fields[19].isdigit():
        raise RuntimeError("Kernel process start identity unavailable")
    return dict(pid=pid, start=f"{boot}:{fields[19]}")


def emit(event, **fields):
    global communication_error
    row = dict(event=event, **fields)
    if request:
        row.update(attemptId=request["attemptId"], launchNonce=request["launchNonce"])
    try:
        print(json.dumps(row), flush=True)
    except (BrokenPipeError, OSError) as error:
        communication_error = str(error)
        disconnected.set()


def child_pids():
    location = f"/proc/{os.getpid()}/task/{os.getpid()}/children"
    with open(location, encoding="ascii") as source:
        values = source.read().split()
    if any(not value.isascii() or not value.isdecimal() or int(value) <= 0 for value in values):
        raise RuntimeError(f"Malformed required children interface: {location}")
    return [int(value) for value in values]


def capability():
    if sys.platform != "linux" or sys.version_info < (3, 9):
        raise RuntimeError("Linux supervisor requires Python 3.9+ and Linux pidfd/subreaper support")
    if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
        raise RuntimeError("Python 3.9+ pidfd APIs are unavailable; no weaker fallback")
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "PR_SET_CHILD_SUBREAPER failed")
    enabled = ctypes.c_int()
    if libc.prctl(37, ctypes.addressof(enabled), 0, 0, 0) != 0 or enabled.value != 1:
        raise RuntimeError("Subreaper capability was not confirmed")
    fd = os.pidfd_open(os.getpid())
    try:
        signal.pidfd_send_signal(fd, 0)
    finally:
        os.close(fd)
    # This fresh helper has not launched any children. The same required
    # interface must be usable before admission, not first discovered at cleanup.
    if child_pids():
        raise RuntimeError("Fresh supervisor unexpectedly already owns children")


def publish_proof(proof):
    # Same-directory hard-link publication is atomic and cannot overwrite a proof.
    destination = request["proofFile"]
    fd, temporary = tempfile.mkstemp(prefix="tree-proof-", suffix=".tmp", dir=os.path.dirname(destination))
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(proof, output)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    os.link(temporary, destination)
    os.unlink(temporary)
    directory_fd = os.open(os.path.dirname(destination), os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def main():
    global request, communication_error
    admission_started = time.monotonic()
    capability()
    if sys.argv[1:] == ["--check"]:
        # Standalone CI prerequisite diagnostic; invocation admission uses the
        # identity acknowledgement mode below. Neither mode can fork an engine.
        emit("capable", mechanism="linux-subreaper", helper=identity(os.getpid()))
        return 0
    if len(sys.argv) == 4 and sys.argv[1] == "--check":
        nonce = sys.argv[2]
        emit("capable", mechanism="linux-subreaper", helper=identity(os.getpid()), probeNonce=nonce)
        # Stay inspectable until the coordinator acknowledges the exact probe.
        # This branch cannot fork an engine, including on valid acknowledgement.
        deadline = admission_started + min(int(sys.argv[3]), 60000) / 1000
        acknowledgement = b""
        os.set_blocking(0, False)
        while b"\n" not in acknowledgement and not disconnected.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([0], [], [], remaining)[0]:
                break
            chunk = os.read(0, 4096)
            if not chunk:
                break
            acknowledgement += chunk
            if len(acknowledgement) > 65536:
                break
        return 0 if acknowledgement == (nonce + "\n").encode("ascii") and not disconnected.is_set() else 1
    with open(sys.argv[1], encoding="utf-8") as source:
        request = json.load(source)
    helper = identity(os.getpid())
    base = dict(version=1, attemptId=request["attemptId"], reservationToken=request["reservationToken"],
                launchNonce=request["launchNonce"], helper=helper)
    def control():
        global communication_error
        try:
            for _ in sys.stdin:
                pass
        except Exception as error:
            communication_error = str(error)
        finally:
            disconnected.set()
    signal.signal(signal.SIGTERM, lambda *_: disconnected.set())
    signal.signal(signal.SIGINT, lambda *_: disconnected.set())
    emit("ready", helper=helper, mechanism="linux-subreaper")
    # Remain single-threaded until fork. Partial input cannot block past admission.
    authorization = b""
    admission_deadline = admission_started + min(request["startupMs"], 60000) / 1000
    os.set_blocking(0, False)
    while b"\n" not in authorization and not disconnected.is_set():
        remaining = admission_deadline - time.monotonic()
        if remaining <= 0 or not select.select([0], [], [], remaining)[0]:
            break
        chunk = os.read(0, 4096)
        if not chunk:
            break
        authorization += chunk
        if len(authorization) > 65536:
            break
    os.set_blocking(0, True)
    def refuse_launch():
        proof = dict(base, status="not-run", root=None, exit=None, signal=None,
                     timedOut=False, interrupted=disconnected.is_set(), startedAt=None, finishedAt=timestamp(),
                     tree=dict(mechanism="linux-subreaper", empty=True, observation="no-launch"))
        publish_proof(proof)
        emit("finished", status="not-run")
        return 75
    if (authorization != (request["launchNonce"] + "\n").encode("ascii")
            or disconnected.is_set() or time.monotonic() >= admission_deadline):
        return refuse_launch()
    # The sole waiter is this main loop. No handler/thread or subprocess destructor
    # may reap a child. Reset SIGCHLD above; fork before starting the reader thread.
    started_at = timestamp()
    deadline = time.monotonic() + request["timeoutMs"] / 1000
    error_read, error_write = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        output = open(request["logFile"], "xb", buffering=0)
    except OSError as error:
        # No fork has occurred. Only this pre-root open boundary may claim
        # no-launch; later parent/close failures retain their real ancestry.
        os.close(error_read)
        os.close(error_write)
        base["launchError"] = str(error)
        try:
            print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        except OSError:
            disconnected.set()
        return refuse_launch()
    with output:
        if disconnected.is_set() or time.monotonic() >= admission_deadline:
            os.close(error_read)
            os.close(error_write)
            return refuse_launch()
        child_pid = os.fork()
        if child_pid == 0:
            try:
                os.close(error_read)
                os.chdir(request["cwd"])
                null = os.open(os.devnull, os.O_RDONLY)
                os.dup2(null, 0)
                os.dup2(output.fileno(), 1)
                os.dup2(output.fileno(), 2)
                for descriptor in os.listdir("/proc/self/fd"):
                    fd = int(descriptor)
                    if fd > 2 and fd != error_write:
                        try:
                            os.close(fd)
                        except OSError as error:
                            if error.errno != errno.EBADF:
                                raise
                os.execv(request["command"], [request["command"], *request["args"]])
            except BaseException as error:
                try:
                    os.write(error_write, str(error).encode("utf-8")[:4000])
                finally:
                    os._exit(127)
    os.close(error_write)
    # Until this single waiter reaps it, even a fast-exiting root stays identifiable.
    root = None
    identity_error = None
    try:
        root = identity(child_pid)
    except Exception as error:
        identity_error = str(error)
        disconnected.set()
    emit("started", root=root, startedAt=started_at)
    threading.Thread(target=control, daemon=True).start()
    root_exit = None
    timed_out = False
    stopping = False
    cleanup_deadline = None
    exec_error = b""
    while True:
        try:
            exec_error += os.read(error_read, 4096)
        except BlockingIOError:
            pass
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                if root_exit is None or root is None:
                    raise RuntimeError(identity_error or "Root outcome unavailable after ECHILD")
                # Re-read the nonblocking exec channel after root reap: its final
                # failure write may have happened between the earlier read and wait.
                try:
                    exec_error += os.read(error_read, 4096)
                except BlockingIOError:
                    pass
                os.close(error_read)
                finished_at = timestamp()
                interrupted = disconnected.is_set()
                status = "timed-out" if timed_out else "interrupted" if interrupted else "not-run" if exec_error else "exited"
                terminal_exit = 124 if timed_out else 125 if interrupted else 75 if exec_error else 0 if root_exit == 0 else 1
                proof = dict(base, status=status, root=root,
                             exit=root_exit if root_exit >= 0 else None,
                             signal=signal.Signals(-root_exit).name if root_exit < 0 else None,
                             timedOut=timed_out, interrupted=interrupted,
                             startedAt=started_at, finishedAt=finished_at,
                             launchError=exec_error.decode("utf-8", errors="replace") or None,
                             communicationError=communication_error,
                             tree=dict(mechanism="linux-subreaper", empty=True,
                                       observation="ECHILD", observedAt=finished_at))
                publish_proof(proof)
                emit("finished", status=status)
                return terminal_exit
            if pid == 0:
                break
            if pid == child_pid:
                root_exit = os.waitstatus_to_exitcode(status)
                emit("root-exit", exit=root_exit)
        if not stopping and (time.monotonic() >= deadline or disconnected.is_set()):
            timed_out = not disconnected.is_set()
            stopping = True
            cleanup_deadline = time.monotonic() + 10
            emit("stopping", timedOut=timed_out)
        if stopping:
            for pid in child_pids():
                try:
                    fd = os.pidfd_open(pid)
                except ProcessLookupError:
                    continue
                try:
                    # No concurrent reap between numeric selection and pidfd open.
                    # Open first, then check actual direct-child ownership; signal
                    # only the pinned handle, never an unowned/reused numeric PID.
                    with open(f"/proc/{pid}/stat", encoding="ascii") as source:
                        stat = source.read()
                    fields = stat[stat.rfind(")") + 2:].split()
                    if int(fields[1]) != os.getpid():
                        raise RuntimeError("Child ownership changed; refuse signal")
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
                except (FileNotFoundError, ProcessLookupError):
                    pass
                finally:
                    os.close(fd)
            if time.monotonic() >= cleanup_deadline:
                raise RuntimeError("Owned ancestry exit unconfirmed")
        time.sleep(0.02)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        emit("unknown", reason=str(error))
        # Missing final proof remains unknown even if this helper subsequently dies.
        raise
