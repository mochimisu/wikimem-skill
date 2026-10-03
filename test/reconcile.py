import pathlib, subprocess, tempfile, unittest, tomllib

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'nix/reconcile.py'
class Reconcile(unittest.TestCase):
    def test_preserves_settings_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root/'.codex').mkdir()
            config = root/'.codex/config.toml'
            config.write_text('model="existing"\n[mcp_servers.other]\nurl="https://example.test"\n[mcp_servers.wikimem]\ncommand="old"\n[mcp_servers.wikimem.env]\nOLD="value"\n[features]\ncustom=true\n')
            settings=root/'settings.json';settings.write_text('{}')
            skill=root/'skill';skill.mkdir();(skill/'SKILL.md').write_text('name: wikimem')
            args=['python3',str(SCRIPT),str(root),str(settings),'/nix/store/example/bin/wikimem-mcp',str(skill)]
            subprocess.run(args,check=True)
            first=config.read_text();data=tomllib.loads(first)
            self.assertEqual(data['model'],'existing');self.assertTrue(data['features']['custom'])
            self.assertEqual(data['mcp_servers']['other']['url'],'https://example.test')
            self.assertNotIn('env',data['mcp_servers']['wikimem'])
            subprocess.run(args,check=True);self.assertEqual(config.read_text(),first)
            self.assertTrue((root/'.codex/skills/wikimem').is_symlink())
    def test_malformed_input_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);(root/'.codex').mkdir();p=root/'.codex/config.toml';p.write_text('invalid [')
            r=subprocess.run(['python3',str(SCRIPT),str(root),'unused','unused','unused'],capture_output=True)
            self.assertNotEqual(r.returncode,0);self.assertEqual(p.read_text(),'invalid [')

unittest.main()
