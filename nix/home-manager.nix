{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.programs.wikimem;
  settings = pkgs.writeText "wikimem-client.json" (builtins.toJSON ({
    url = cfg.url;
    keyFile = cfg.keyFile;
  } // lib.optionalAttrs (cfg.localUrl != null) { localUrl = cfg.localUrl; }
    // lib.optionalAttrs (cfg.sshTarget != null) { sshTarget = cfg.sshTarget; remotePort = cfg.remotePort; }));
in {
  options.programs.wikimem = {
    enable = lib.mkEnableOption "Wikimem service-backed memory for local Codex";
    package = lib.mkOption { type = lib.types.package; default = self.packages.${pkgs.stdenv.hostPlatform.system}.client; };
    skillPackage = lib.mkOption { type = lib.types.package; default = self.packages.${pkgs.stdenv.hostPlatform.system}.skill; };
    url = lib.mkOption { type = lib.types.str; description = "Canonical HTTPS MCP endpoint."; };
    keyFile = lib.mkOption { type = lib.types.str; default = "${config.home.homeDirectory}/.config/wikimem/codex.key"; description = "Runtime key path, never plaintext secret content."; };
    localUrl = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
    sshTarget = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; description = "Optional verified SSH target for LAN-first routing."; };
    remotePort = lib.mkOption { type = lib.types.port; default = 4783; };
  };
  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    home.activation.wikimem = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      run ${pkgs.python3}/bin/python3 ${./reconcile.py} \
        ${lib.escapeShellArg config.home.homeDirectory} \
        ${settings} ${cfg.package}/bin/wikimem-mcp \
        ${cfg.skillPackage}/share/wikimem/skills/wikimem
    '';
  };
}
