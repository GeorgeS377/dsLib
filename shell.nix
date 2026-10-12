# Development environment for dsLib.
#
#   nix-shell          # drops you into a shell with the tools below
#
# The application itself needs only Node — every npm dependency is pure
# JavaScript, so no compiler is required to install or run it. gcc/gnumake are
# here only so that a native module *could* be built if we ever chose one, and
# sqlite is here for inspecting the database and testing backup/restore by hand.
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  name = "dslib";

  packages = with pkgs; [
    nodejs_24 # runtime; provides built-in node:sqlite and node:test
    sqlite # `sqlite3` CLI for poking at data/library.db
    gcc
    gnumake
  ];

  shellHook = ''
    echo "dsLib dev shell — node $(node --version), sqlite $(sqlite3 --version | cut -d' ' -f1)"
    echo "  npm install      install dependencies"
    echo "  npm run migrate  apply database migrations"
    echo "  npm run dev      start with auto-reload"
    echo "  npm test         run the test suite"
  '';
}
