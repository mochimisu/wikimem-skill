{ lib, buildNpmPackage, nodejs_24, makeWrapper, openssh }:
buildNpmPackage {
  pname = "wikimem-client";
  version = "0.2.0";
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [ ../package.json ../package-lock.json ../src ../scripts ];
  };
  nodejs = nodejs_24;
  npmDepsHash = "sha256-bdncynRNxLQXYGWYUpNVLkz7twNekg7u2YCrMgjWOn4=";
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];
  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/wikimem $out/bin
    cp -r src scripts node_modules $out/lib/wikimem/
    cp package.json $out/lib/wikimem/
    makeWrapper ${nodejs_24}/bin/node $out/bin/wikimem-mcp \
      --add-flags "$out/lib/wikimem/scripts/mcp-bridge.js" \
      --prefix PATH : ${lib.makeBinPath [ openssh ]}
    runHook postInstall
  '';
  meta.description = "Authenticated Wikimem MCP client with optional SSH and HTTPS fallback";
}
