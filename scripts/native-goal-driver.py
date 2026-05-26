#!/usr/bin/env python3
import argparse
import json
import os
import pty
import select
import re
import struct
import subprocess
import termios
import time
import fcntl


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--prompts-json", required=True)
    parser.add_argument("--verify", required=True)
    parser.add_argument("--restart-after-prompt", type=int, default=0)
    parser.add_argument("--restart-wait-command")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args()

    with open(args.prompts_json, "r", encoding="utf-8") as handle:
        prompts = json.load(handle)
    if not prompts:
        raise SystemExit("prompts-json must contain at least one prompt")

    os.makedirs(os.path.dirname(args.transcript), exist_ok=True)

    if args.restart_after_prompt:
        if args.restart_after_prompt >= len(prompts):
            raise SystemExit("--restart-after-prompt requires at least one remaining prompt")
        first_prompts = prompts[: args.restart_after_prompt]
        remaining_prompts = prompts[args.restart_after_prompt :]
        first_code, first_tail = run_session(
            workspace=args.workspace,
            model=args.model,
            transcript_path=args.transcript,
            prompts=first_prompts,
            success_command=args.restart_wait_command or args.verify,
            timeout_seconds=max(45, min(args.timeout_seconds, 120)),
            stop_on_verify_only=True,
        )
        if first_code != 0:
            return first_code
        resume_id = extract_resume_id(first_tail)
        second_code, _ = run_session(
            workspace=args.workspace,
            model=args.model,
            transcript_path=args.transcript,
            prompts=remaining_prompts,
            success_command=args.verify,
            timeout_seconds=args.timeout_seconds,
            resume_id=resume_id or "--last",
        )
        return second_code

    code, _ = run_session(
        workspace=args.workspace,
        model=args.model,
        transcript_path=args.transcript,
        prompts=prompts,
        success_command=args.verify,
        timeout_seconds=args.timeout_seconds,
    )
    return code


def run_session(
    workspace: str,
    model: str,
    transcript_path: str,
    prompts: list[str],
    success_command: str,
    timeout_seconds: int,
    resume_id: str | None = None,
    stop_on_verify_only: bool = False,
) -> tuple[int, bytes]:
    master_fd, slave_fd = pty.openpty()
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
    env = os.environ.copy()
    env.setdefault("TERM", "xterm-256color")
    env.setdefault("COLORTERM", "truecolor")

    if resume_id:
        command = [
            "codex",
            "resume",
            "--no-alt-screen",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C",
            workspace,
            "-m",
            model,
        ]
        if resume_id == "--last":
            command.append("--last")
        else:
            command.append(resume_id)
    else:
        command = [
            "codex",
            "--no-alt-screen",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C",
            workspace,
            "-m",
            model,
        ]

    process = subprocess.Popen(
        command,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=workspace,
        env=env,
        close_fds=True,
    )
    os.close(slave_fd)

    start = time.monotonic()
    next_trust_enter = start + 3
    prompt_index = 0
    next_prompt_time = None
    last_prompt_sent = None
    verified_since = None
    visible_complete_since = None
    transcript_tail = b""

    with open(transcript_path, "ab") as transcript:
        transcript.write(("$ " + " ".join(command) + "\n").encode("utf-8"))

        while True:
            now = time.monotonic()
            if now - start > timeout_seconds:
                transcript.write(b"\n[NATIVE_DRIVER_TIMEOUT]\n")
                transcript_tail += terminate(process, master_fd, transcript)
                return 124, transcript_tail

            readable, _, _ = select.select([master_fd], [], [], 0.2)
            if readable:
                try:
                    chunk = os.read(master_fd, 8192)
                except OSError:
                    chunk = b""
                if not chunk:
                    break
                transcript.write(chunk)
                transcript.flush()
                transcript_tail = (transcript_tail + chunk)[-12000:]
                respond_to_terminal_queries(master_fd, transcript_tail)

                clean = strip_ansi(transcript_tail).lower()
                if b"do you trust the contents" in clean:
                    os.write(master_fd, b"\r")
                    next_trust_enter = float("inf")
                if prompt_index == 0 and ready_for_prompt(clean):
                    next_prompt_time = now + 1
                if b"goal achieved" in clean or b"goal marked complete" in clean or b"verification passed" in clean:
                    if visible_complete_since is None:
                        visible_complete_since = now

            if now >= next_trust_enter:
                os.write(master_fd, b"\r")
                next_trust_enter = float("inf")

            if next_prompt_time is not None and now >= next_prompt_time and prompt_index < len(prompts):
                send_prompt(master_fd, prompts[prompt_index])
                transcript.write(f"\n[NATIVE_DRIVER_SENT_PROMPT {prompt_index + 1}]\n".encode("utf-8"))
                transcript.flush()
                prompt_index += 1
                last_prompt_sent = now
                next_prompt_time = None

            if last_prompt_sent is not None and prompt_index < len(prompts) and now - last_prompt_sent > 35:
                next_prompt_time = now

            if prompt_index >= len(prompts) and verify_ok(workspace, success_command):
                if verified_since is None:
                    verified_since = now
                if stop_on_verify_only and now - verified_since > 1:
                    transcript.write(b"\n[NATIVE_DRIVER_CHECKPOINT_OK]\n")
                    transcript_tail += terminate(process, master_fd, transcript)
                    return 0, transcript_tail
                visible_done = visible_complete_since is not None and now - visible_complete_since > 2
                stale_done = now - verified_since > 25
                if visible_done or stale_done:
                    transcript.write(b"\n[NATIVE_DRIVER_VERIFY_OK]\n")
                    transcript_tail += terminate(process, master_fd, transcript)
                    return 0, transcript_tail
            else:
                verified_since = None

            if process.poll() is not None:
                return process.returncode or 0, transcript_tail

    return process.returncode or 0, transcript_tail


def ready_for_prompt(clean: bytes) -> bool:
    return (
        b"use /skills to list available skills" in clean
        or b"mcp startup incomplete" in clean
        or (b"gpt-" in clean and (b"high" in clean or b"default" in clean))
    )


def send_prompt(master_fd: int, prompt: str) -> None:
    os.write(master_fd, b"\x1b[200~")
    os.write(master_fd, prompt.encode("utf-8"))
    os.write(master_fd, b"\x1b[201~")
    time.sleep(0.5)
    os.write(master_fd, b"\r")


def verify_ok(workspace: str, command: str) -> bool:
    result = subprocess.run(command, cwd=workspace, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return result.returncode == 0


def terminate(process: subprocess.Popen, master_fd: int, transcript) -> bytes:
    tail = b""
    try:
        os.write(master_fd, b"\x03")
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            readable, _, _ = select.select([master_fd], [], [], 0.2)
            if readable:
                try:
                    chunk = os.read(master_fd, 8192)
                except OSError:
                    break
                if not chunk:
                    break
                transcript.write(chunk)
                transcript.flush()
                tail = (tail + chunk)[-12000:]
            if process.poll() is not None:
                break
    except OSError:
        return tail
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)
    try:
        os.close(master_fd)
    except OSError:
        pass
    return tail


def extract_resume_id(transcript_tail: bytes) -> str | None:
    clean = strip_ansi(transcript_tail).decode("utf-8", errors="ignore")
    match = re.search(r"codex\s+resume\s+([0-9a-fA-F-]{20,})", clean)
    return match.group(1) if match else None


def respond_to_terminal_queries(master_fd: int, data: bytes) -> None:
    responses = {
        b"\x1b[6n": b"\x1b[1;1R",
        b"\x1b]10;?\x1b\\": b"\x1b]10;rgb:ffff/ffff/ffff\x1b\\",
        b"\x1b]11;?\x1b\\": b"\x1b]11;rgb:0000/0000/0000\x1b\\",
        b"\x1b[c": b"\x1b[?1;2c",
        b"\x1b[?u": b"\x1b[?1u",
    }
    for query, response in responses.items():
        if query in data:
            try:
                os.write(master_fd, response)
            except OSError:
                return


def strip_ansi(value: bytes) -> bytes:
    # Keep this intentionally rough; readiness matching only needs visible ASCII fragments.
    text = value.replace(b"\x1b", b"\n")
    for byte in b"[]();?0123456789:;=<>\\/\r":
        text = text.replace(bytes([byte]), b" ")
    return b" ".join(text.split())


if __name__ == "__main__":
    raise SystemExit(main())
