{
  description = "Portable Wikimem skill, plugin and authenticated MCP client";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
    eachSystem = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
  in {
    packages = eachSystem (pkgs: let
      skill = pkgs.runCommand "wikimem-skill-0.2.0" {} ''
        mkdir -p $out/share/wikimem
        cp -r ${./plugin}/. $out/share/wikimem/
      '';
          client = pkgs.callPackage ./nix/client.nix {};
    in { inherit skill client; default = client; });
    homeManagerModules.default = import ./nix/home-manager.nix { inherit self; };
    checks = eachSystem (pkgs: {
      client = self.packages.${pkgs.stdenv.hostPlatform.system}.client;
      reconcile = pkgs.runCommand "wikimem-reconcile-tests" { nativeBuildInputs = [ pkgs.python3 ]; } ''
        cp -r ${./.} source
        chmod -R u+w source
        cd source
        python3 test/reconcile.py
        touch $out
      '';
    });
    homeManagerModules.skill = { config, lib, pkgs, ... }: {
      options.programs.wikimemSkill.enable = lib.mkEnableOption "the service-backed Wikimem skill";
      config = lib.mkIf config.programs.wikimemSkill.enable {
        home.file.".codex/skills/wikimem".source = "${self.packages.${pkgs.stdenv.hostPlatform.system}.skill}/share/wikimem/skills/wikimem";
      };
    };
  };
}
