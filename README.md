# Wikimem skill and client

Portable instructions and an authenticated MCP client for Wikimem: scoped search, selected reads, revision-checked edits, navigation, metadata queries, history, structural checks, and page moves.

This repository contains no server, memory corpus, credentials, personal service URL, host addresses, ingestion runner or run history. It contains the skill's ingestion/upkeep guidance. Installing it does not grant account access or create scheduled tasks.

## Declarative Codex setup

Add the flake to your configuration and import its Home Manager module:

```nix
inputs.wikimem-skill = {
  url = "github:mochimisu/wikimem-skill";
  inputs.nixpkgs.follows = "nixpkgs";
};

# In the Home Manager module imports:
imports = [ inputs.wikimem-skill.homeManagerModules.default ];
programs.wikimem = {
  enable = true;
  url = "https://memory.example/mcp";
  keyFile = "/run/secrets/wikimem";
  # Optional, on the server machine:
  # localUrl = "http://127.0.0.1:4783/mcp";
  # Optional, on other machines:
  # sshTarget = "user@your-lan-host";
};
```

Keep host selection, SSH identities/known-host keys and SOPS enrollment in your private configuration. `keyFile` is a runtime path; never pass secret contents to Nix. `WIKIMEM_API_KEY` can override the file in a secret-manager launcher.

Activation installs the pinned client and skill, reconciles only the Wikimem MCP table, and backs up replaced configuration. It removes recognized legacy Wikiskill entrypoints. Restart Codex after activation. Do not also enable the skill-only module when the default module already owns the same path.

Routing prefers configured loopback, then configured SSH, then the canonical URL. SSH requires existing authentication and strict host-key verification. The tunnel forwards to the remote loopback port (default 4783). HTTP is accepted only for loopback. Route selection happens at startup; failures during a session are surfaced without replaying possibly committed writes. An unavailable server is still unavailable through its public proxy.

## Flake outputs

- `packages.<system>.client` (also `default`): `bin/wikimem-mcp CONFIG.json`.
- `packages.<system>.skill`: portable plugin scaffold under `share/wikimem`.
- `homeManagerModules.default`: configurable client, connection and skill installation.
- `homeManagerModules.skill`: skill-only installation through `programs.wikimemSkill.enable`.

Supported package systems: x86_64/aarch64 Linux and Darwin; runtime validation currently covers x86_64 Linux. The consumer's flake lock pins updates. A local development override does not change the deployment source:

```sh
nix build .#your-target --override-input wikimem-skill path:/path/to/wikimem-skill
```

## Hosted plugin packaging

The checked-in scaffold has no personal endpoint. Generate a connected package with your service origin:

```sh
WIKIMEM_URL=https://memory.example node scripts/package-plugin.js
python3 scripts/zip-plugin.py dist/wikimem dist/wikimem.zip
```

For an already registered ChatGPT MCP connection, additionally set `WIKIMEM_CHATGPT_APP_ID=plugin_asdk_app_YOUR_ID`. This creates `dist/wikimem-chatgpt` using the registered mapping instead of a second standalone connection. Hosted installation and OAuth consent remain account-side steps. Never put computer API keys in the plugin.

## Validation

```sh
npm ci
npm test
python3 test/reconcile.py
nix flake check
```

Tests exercise the real MCP SDK/stdio bridge against isolated local fixtures and verify configuration preservation and idempotence. No production credentials are needed.
