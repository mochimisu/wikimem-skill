"""Idempotently reconcile only Wikimem-owned local Codex configuration."""
import datetime
import os
import pathlib
import re
import shutil
import sys
import tempfile
import tomllib

home, settings, command, skill = map(pathlib.Path, sys.argv[1:])
backup = home / '.local/state/wikimem/nix-backups' / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%f')

def save(p):
    if p.exists() or p.is_symlink():
        backup.mkdir(parents=True, exist_ok=True, mode=0o700)
        target = backup / str(p.relative_to(home)).replace('/', '__')
        if p.is_dir():
            shutil.copytree(p, target, symlinks=True)
        else:
            shutil.copy2(p, target, follow_symlinks=False)

def link(p, source):
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.is_symlink() and os.readlink(p) == str(source):
        return
    save(p)
    if p.is_symlink() or p.is_file():
        p.unlink()
    elif p.exists():
        shutil.rmtree(p)
    p.symlink_to(source)

config = home / '.codex/config.toml'
text = config.read_text() if config.exists() else ''
tomllib.loads(text)  # Refuse malformed input before changing anything.
# Standard Codex-generated TOML tables, including any previous nested tool policy.
pattern = r'(?ms)^\[mcp_servers\.(?:wikimem|"wikimem")(?:\.[^\]\n]+)?\][^\n]*\n.*?(?=^\[|\Z)'
new = re.sub(pattern, '', text).rstrip()
import json
new += '\n\n[mcp_servers.wikimem]\ncommand = ' + json.dumps(str(command)) + '\nargs = [' + json.dumps(str(home / '.config/wikimem/client.json')) + ']\nstartup_timeout_sec = 15\n'
parsed = tomllib.loads(new)
assert parsed['mcp_servers']['wikimem']['command'] == str(command)
if new != text:
    save(config)
    config.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=config.parent, prefix='.wikimem-config-')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(new)
        os.replace(tmp, config)
    finally:
        pathlib.Path(tmp).unlink(missing_ok=True)
link(home / '.config/wikimem/client.json', settings)
link(home / '.codex/skills/wikimem', skill)
legacy = home / '.codex/skills/SKILL.md'
if legacy.exists() and re.search(r'^name: wikiskill$', legacy.read_text(), re.M):
    save(legacy)
    legacy.unlink()
legacy = home / '.agents/skills/wikiskill'
if legacy.is_symlink() and '/plugins/wikiskill/' in os.readlink(legacy):
    save(legacy)
    legacy.unlink()
